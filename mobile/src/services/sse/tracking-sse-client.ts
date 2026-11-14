import type { TrackingEventItem, TrackingSseMessage } from '@/features/tracking/types/tracking.types';
import { Platform } from 'react-native';
import { getToken } from '@/lib/auth/utils';
import { refreshTokens, resolveApiBaseUrl } from '@/services/api/api-client';
import { Logger } from '@/services/logger/logger';
import { calculateBackoffDelay, SseStreamParser } from './bidding-sse-client';

export type TrackingConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type TrackingSseListener = (event: TrackingEventItem) => void;
export type StatusChangeListener = (status: TrackingConnectionStatus) => void;

export type TrackingSseEventMap = {
  open: void;
  close: void;
  error: Error;
  connected: TrackingSseMessage;
  ping: { type: 'ping'; timestamp?: string };
  timeline_event: TrackingEventItem;
};

export type TrackingSseClientOptions = {
  baseUrl?: string;
  maxBackoffMs?: number;
  heartbeatTimeoutMs?: number;
  autoReconnect?: boolean;
  transport?: 'auto' | 'xhr' | 'fetch';
  lastEventId?: string;
};

const DEFAULT_MAX_BACKOFF_MS = 30000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 45000;

/**
 * Production-ready Authenticated SSE Client for Real-Time Tracking.
 * Connects to /api/v1/tracking/requests/:serviceRequestId/live with Bearer JWT.
 * Supports auto-reconnect, Last-Event-ID event recovery, heartbeat watchdog, and token refresh.
 */
export class TrackingSseClient {
  private readonly serviceRequestId: string;
  private readonly baseUrl: string;
  private readonly maxBackoffMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly autoReconnect: boolean;
  private readonly options?: TrackingSseClientOptions;

  private isClosed = false;
  private generation = 0;
  private isConnected = false;
  private status: TrackingConnectionStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventId: string | null = null;

  private abortController: AbortController | null = null;
  private activeXhr: any = null;
  private connectionPromise: Promise<void> | null = null;

  private readonly listeners: Set<TrackingSseListener> = new Set();
  private readonly statusListeners: Set<StatusChangeListener> = new Set();
  private readonly eventListeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(serviceRequestId: string, options?: TrackingSseClientOptions) {
    this.serviceRequestId = serviceRequestId;
    this.options = options;
    this.baseUrl = options?.baseUrl || resolveApiBaseUrl();
    this.maxBackoffMs = options?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.heartbeatTimeoutMs = options?.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.autoReconnect = options?.autoReconnect ?? true;
    if (options?.lastEventId) {
      this.lastEventId = options.lastEventId;
    }
  }

  /**
   * Subscribe to incoming tracking timeline events.
   */
  public onEvent(listener: TrackingSseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to connection status changes ('connected' | 'reconnecting' | 'disconnected').
   */
  public onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * General event listener for lifecycle events ('open', 'close', 'error', 'connected', 'ping', 'timeline_event').
   */
  public on<K extends keyof TrackingSseEventMap>(
    event: K,
    listener: (data: TrackingSseEventMap[K]) => void,
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  public off<K extends keyof TrackingSseEventMap>(
    event: K,
    listener: (data: TrackingSseEventMap[K]) => void,
  ): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private emit<K extends keyof TrackingSseEventMap>(event: K, data: TrackingSseEventMap[K]): void {
    const handlers = this.eventListeners.get(event);
    if (!handlers)
      return;
    for (const handler of Array.from(handlers)) {
      try {
        handler(data);
      }
      catch (err) {
        Logger.error('TRACKING_SSE_LISTENER_ERROR', `Error in handler for ${String(event)}`, err);
      }
    }
  }

  private notifyListeners(event: TrackingEventItem): void {
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event);
      }
      catch (err) {
        Logger.warn('TRACKING_SSE_EVENT_ERROR', 'Error in event listener callback', err);
      }
    }
  }

  private notifyStatus(status: TrackingConnectionStatus): void {
    if (this.status === status)
      return;
    this.status = status;
    for (const listener of Array.from(this.statusListeners)) {
      try {
        listener(status);
      }
      catch (err) {
        Logger.warn('TRACKING_SSE_STATUS_ERROR', 'Error in status listener callback', err);
      }
    }
  }

  /**
   * Connect to the SSE live stream.
   * Single-flight protected to prevent concurrent duplicate connections.
   */
  public async connect(): Promise<void> {
    if (this.isClosed) {
      this.isClosed = false;
    }
    if (this.isConnected || this.activeXhr) {
      return;
    }
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.notifyStatus('reconnecting');
    const generation = ++this.generation;
    this.connectionPromise = (async () => {
      try {
        this.clearTimers();
        this.cleanupActiveConnection();
        await this.startStream(generation);
      }
      finally {
        if (generation === this.generation) {
          this.connectionPromise = null;
        }
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Disconnect and abort any ongoing stream and timers.
   */
  public disconnect(): void {
    this.isClosed = true;
    this.generation += 1;
    this.connectionPromise = null;
    this.cleanupActiveConnection();
    this.clearTimers();
    this.notifyStatus('disconnected');
    this.listeners.clear();
    this.statusListeners.clear();
    this.eventListeners.clear();
  }

  private cleanupActiveConnection(): void {
    if (this.abortController) {
      try {
        this.abortController.abort();
      }
      catch {}
      this.abortController = null;
    }
    if (this.activeXhr) {
      try {
        this.activeXhr.abort();
      }
      catch {}
      this.activeXhr = null;
    }
    if (this.isConnected) {
      this.isConnected = false;
      this.emit('close', undefined as void);
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatWatchdogTimer) {
      clearTimeout(this.heartbeatWatchdogTimer);
      this.heartbeatWatchdogTimer = null;
    }
  }

  private resetHeartbeatWatchdog(): void {
    if (this.heartbeatWatchdogTimer) {
      clearTimeout(this.heartbeatWatchdogTimer);
    }
    this.heartbeatWatchdogTimer = setTimeout(() => {
      Logger.warn(
        'TRACKING_SSE_HEARTBEAT_TIMEOUT',
        `No event or keepalive received in ${this.heartbeatTimeoutMs}ms. Reconnecting.`,
      );
      this.cleanupActiveConnection();
      this.notifyStatus('reconnecting');
      this.scheduleReconnect();
    }, this.heartbeatTimeoutMs);
  }

  private scheduleReconnect(immediate = false): void {
    if (this.isClosed || !this.autoReconnect)
      return;
    this.clearTimers();
    this.notifyStatus('reconnecting');

    const delay = immediate ? 0 : calculateBackoffDelay(this.reconnectAttempt, this.maxBackoffMs);
    this.reconnectAttempt += 1;

    Logger.debug('TRACKING_SSE_RECONNECT_SCHEDULED', `Reconnecting in ${delay}ms (attempt #${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private buildStreamUrl(): string {
    const cleanBaseUrl = this.baseUrl.replace(/\/api\/v1\/?$/, '');
    let url = `${cleanBaseUrl}/api/v1/tracking/requests/${encodeURIComponent(this.serviceRequestId)}/live`;
    if (this.lastEventId) {
      url += `?lastEventId=${encodeURIComponent(this.lastEventId)}`;
    }
    return url;
  }

  private async startStream(generation: number): Promise<void> {
    if (this.isClosed)
      return;

    let token = getToken()?.access;
    if (!token) {
      Logger.warn('TRACKING_SSE_NO_TOKEN', 'No access token available for SSE stream. Attempting refresh...');
      try {
        token = await refreshTokens();
      }
      catch (err) {
        Logger.error('TRACKING_SSE_AUTH_HALTED', 'No valid token and refresh failed. Halting reconnection.', err);
        this.emit('error', new Error('Authentication required: no access token available'));
        this.clearTimers();
        this.notifyStatus('disconnected');
        return;
      }
    }

    if (this.isClosed || generation !== this.generation)
      return;

    const url = this.buildStreamUrl();
    const parser = new SseStreamParser();

    parser.onComment = (_comment) => {
      this.resetHeartbeatWatchdog();
    };

    parser.onEvent = (eventName, rawData, id) => {
      this.resetHeartbeatWatchdog();
      if (id) {
        this.lastEventId = id;
      }
      this.handleParsedEvent(eventName, rawData);
    };

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const isWeb = Platform.OS === 'web';
      const transport = this.options?.transport ?? 'auto';
      const useFetch = transport === 'fetch' || (transport === 'auto' && isWeb && typeof fetch !== 'undefined');

      if (useFetch) {
        await this.streamViaFetch(url, parser, { token, signal });
      }
      else {
        this.streamViaXhr(url, token, parser);
      }
    }
    catch (err: any) {
      if (this.isClosed || signal.aborted)
        return;

      Logger.warn('TRACKING_SSE_STREAM_ERROR', 'Stream failed with error', err?.message || err);
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.scheduleReconnect();
    }
  }

  private async streamViaFetch(
    url: string,
    parser: SseStreamParser,
    options: { signal: AbortSignal; token?: string },
  ): Promise<void> {
    const { signal, token } = options;
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (this.lastEventId) {
      headers['Last-Event-ID'] = this.lastEventId;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal,
      });
    }
    catch (fetchErr: any) {
      if (signal.aborted || this.isClosed)
        return;
      throw fetchErr;
    }

    if (signal.aborted || this.isClosed)
      return;

    if (response.status === 401) {
      Logger.warn('TRACKING_SSE_AUTH_EXPIRED', 'SSE connection 401 Unauthorized. Refreshing token...');
      try {
        await refreshTokens();
        this.scheduleReconnect(true);
        return;
      }
      catch (refreshErr) {
        Logger.error('TRACKING_SSE_REFRESH_FAILED', 'Token refresh failed during SSE reconnect', refreshErr);
        this.emit('error', new Error('Authentication expired and token refresh failed'));
        this.clearTimers();
        this.notifyStatus('disconnected');
        return;
      }
    }

    if (!response.ok) {
      throw new Error(`SSE HTTP error status: ${response.status} ${response.statusText}`);
    }

    this.onStreamOpened();

    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

      while (!this.isClosed && !signal.aborted) {
        const { done, value } = await reader.read();
        if (done)
          break;
        if (value) {
          const chunk = decoder ? decoder.decode(value, { stream: true }) : String.fromCharCode(...value);
          parser.feed(chunk);
        }
      }
    }
    else {
      Logger.warn(
        'TRACKING_SSE_FETCH_NO_READER',
        'Fetch response.body.getReader not available. Falling back to XMLHttpRequest.',
      );
      this.streamViaXhr(url, token, parser);
      return;
    }

    if (!this.isClosed && !signal.aborted) {
      Logger.debug('TRACKING_SSE_STREAM_ENDED', 'Stream ended naturally. Reconnecting...');
      this.cleanupActiveConnection();
      this.scheduleReconnect();
    }
  }

  private streamViaXhr(url: string, token: string | undefined, parser: SseStreamParser): void {
    if (typeof XMLHttpRequest === 'undefined') {
      throw new TypeError('Neither fetch nor XMLHttpRequest is available in this environment');
    }

    const xhr = new XMLHttpRequest();
    this.activeXhr = xhr;
    let lastProcessedIndex = 0;
    let isAbortingForAuth = false;

    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    if (this.lastEventId) {
      xhr.setRequestHeader('Last-Event-ID', this.lastEventId);
    }

    xhr.onreadystatechange = () => {
      if (this.isClosed || this.activeXhr !== xhr)
        return;

      if (xhr.readyState === 2) {
        if (xhr.status === 401) {
          isAbortingForAuth = true;
          this.activeXhr = null;
          const generation = this.generation;
          try {
            xhr.abort();
          }
          catch {}
          Logger.warn('TRACKING_SSE_XHR_401', 'XHR received 401 Unauthorized. Refreshing tokens...');
          refreshTokens()
            .then(() => {
              if (generation === this.generation) {
                this.scheduleReconnect(true);
              }
            })
            .catch((err) => {
              Logger.error('TRACKING_SSE_REFRESH_FAILED', 'Token refresh failed during XHR SSE reconnect', err);
              this.emit('error', new Error('Authentication expired and token refresh failed'));
              this.clearTimers();
              this.notifyStatus('disconnected');
            });
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          this.onStreamOpened();
        }
      }
    };

    xhr.onprogress = () => {
      if (this.isClosed || this.activeXhr !== xhr || isAbortingForAuth)
        return;
      const text = xhr.responseText || '';
      const newChunk = text.slice(lastProcessedIndex);
      lastProcessedIndex = text.length;
      if (newChunk) {
        parser.feed(newChunk);
      }
    };

    xhr.onload = () => {
      if (this.isClosed || this.activeXhr !== xhr || isAbortingForAuth)
        return;
      this.cleanupActiveConnection();
      this.scheduleReconnect();
    };

    xhr.onerror = (_e) => {
      if (this.isClosed || this.activeXhr !== xhr || isAbortingForAuth)
        return;
      this.cleanupActiveConnection();
      this.emit('error', new Error('XHR Network error during SSE connection'));
      this.scheduleReconnect();
    };

    xhr.send();
  }

  private onStreamOpened(): void {
    this.isConnected = true;
    this.reconnectAttempt = 0;
    this.resetHeartbeatWatchdog();
    this.notifyStatus('connected');
    this.emit('open', undefined as void);
  }

  private handleParsedEvent(eventName: string, rawData: string): void {
    try {
      const parsedData = rawData ? JSON.parse(rawData) : {};
      const messageType = parsedData.type || eventName;

      switch (messageType) {
        case 'connected':
          this.onStreamOpened();
          this.emit('connected', parsedData as TrackingSseMessage);
          break;
        case 'ping':
          this.resetHeartbeatWatchdog();
          this.emit('ping', parsedData as { type: 'ping'; timestamp?: string });
          break;
        case 'timeline_event': {
          const item: TrackingEventItem = parsedData.payload || parsedData.data || parsedData;
          if (item?.id) {
            this.lastEventId = item.id;
          }
          this.notifyListeners(item);
          this.emit('timeline_event', item);
          break;
        }
        default:
          if (parsedData.payload) {
            const item: TrackingEventItem = parsedData.payload;
            if (item?.id) {
              this.lastEventId = item.id;
            }
            this.notifyListeners(item);
            this.emit('timeline_event', item);
          }
          else {
            Logger.debug('TRACKING_SSE_UNKNOWN_EVENT', `Received unhandled event: ${eventName}`, parsedData);
          }
          break;
      }
    }
    catch (parseErr) {
      Logger.warn('TRACKING_SSE_DATA_PARSE_ERROR', `Failed to parse SSE JSON for ${eventName}: ${rawData}`, parseErr);
    }
  }

  public getIsOpen(): boolean {
    return this.isConnected && !this.isClosed;
  }

  public getStatus(): TrackingConnectionStatus {
    return this.status;
  }

  public getLastEventId(): string | null {
    return this.lastEventId;
  }
}
