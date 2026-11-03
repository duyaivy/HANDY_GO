import { Platform } from 'react-native';
import { getToken } from '@/lib/auth/utils';
import { refreshTokens, resolveApiBaseUrl } from '@/services/api/api-client';
import { Logger } from '@/services/logger/logger';

export type SseReadyEvent = {
  requestId: string;
  connectedAt: string;
  heartbeatIntervalMs: number;
};

export type SseBidChangedEvent = {
  eventId: string;
  requestId: string;
  kind: 'submitted' | 'revised' | 'withdrawn';
  occurredAt: string;
};

export type SseRoundChangedEvent = {
  eventId: string;
  requestId: string;
  kind: 'opened' | 'closed' | 'extended' | 'finalized' | 'cancelled' | 'no_bid';
  occurredAt: string;
};

export type SseMatchingChangedEvent = {
  eventId: string;
  requestId: string;
  kind: 'completed' | 'failed';
  occurredAt: string;
};

export type SseSyncRequiredEvent = {
  eventId: string;
  requestId: string;
  occurredAt: string;
  reason: 'bridge.ready';
};

export type BiddingSseEventMap = {
  'sync.required': SseSyncRequiredEvent;
  'ready': SseReadyEvent;
  'bid.changed': SseBidChangedEvent;
  'round.changed': SseRoundChangedEvent;
  'matching.changed': SseMatchingChangedEvent;
  'open': void;
  'error': Error;
  'close': void;
};

export type SseListener<T = unknown> = (data: T) => void;

export type BiddingSseClientOptions = {
  baseUrl?: string;
  maxBackoffMs?: number;
  heartbeatTimeoutMs?: number;
  autoReconnect?: boolean;
  transport?: 'auto' | 'xhr' | 'fetch';
};

const DEFAULT_MAX_BACKOFF_MS = 30000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 45000;
const BACKOFF_STEPS = [1000, 2000, 5000, 10000];

/**
 * Calculates exponential backoff delay with +/- 20% jitter.
 */
export function calculateBackoffDelay(attempt: number, maxBackoffMs = DEFAULT_MAX_BACKOFF_MS): number {
  const base = attempt < BACKOFF_STEPS.length ? BACKOFF_STEPS[attempt] : maxBackoffMs;
  const jitterRange = base * 0.2;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.min(maxBackoffMs, Math.max(500, Math.round(base + jitter)));
}

/**
 * Parses raw SSE text chunks into event blocks.
 */
export class SseStreamParser {
  private buffer = '';

  public onEvent?: (eventName: string, data: string) => void;

  public onComment?: (comment: string) => void;

  public feed(chunk: string): void {
    this.buffer += chunk;
    // SSE event messages are separated by double newlines (\n\n or \r\n\r\n)
    const normalized = this.buffer.replace(/\r\n/g, '\n');
    const parts = normalized.split('\n\n');

    // Keep the last incomplete fragment in the buffer
    this.buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (!part.trim())
        continue;
      this.parseBlock(part);
    }
  }

  private parseBlock(block: string): void {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line)
        continue;
      if (line.startsWith(':')) {
        // SSE Comment line (e.g. :keepalive ...)
        this.onComment?.(line.slice(1).trim());
        continue;
      }
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      }
      else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      this.onEvent?.(eventName, dataLines.join('\n'));
    }
  }

  public reset(): void {
    this.buffer = '';
  }
}

/**
 * Production-ready Authenticated SSE Client for Real-Time Bidding.
 * Connects to /bids/requests/:requestId/events with Bearer JWT.
 */
export class BiddingSseClient {
  private readonly requestId: string;

  private readonly baseUrl: string;

  private readonly maxBackoffMs: number;

  private readonly heartbeatTimeoutMs: number;

  private readonly autoReconnect: boolean;

  private readonly options?: BiddingSseClientOptions;

  private isClosed = false;

  private generation = 0;

  private isConnected = false;

  private reconnectAttempt = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private heartbeatWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private abortController: AbortController | null = null;

  private activeXhr: any = null;

  private connectionPromise: Promise<void> | null = null;

  private readonly listeners: Map<string, Set<SseListener<any>>> = new Map();

  constructor(requestId: string, options?: BiddingSseClientOptions) {
    this.requestId = requestId;
    this.options = options;
    this.baseUrl = options?.baseUrl || resolveApiBaseUrl();
    this.maxBackoffMs = options?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.heartbeatTimeoutMs = options?.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    this.autoReconnect = options?.autoReconnect ?? true;
  }

  public on<K extends keyof BiddingSseEventMap>(
    event: K,
    listener: SseListener<BiddingSseEventMap[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  public off<K extends keyof BiddingSseEventMap>(
    event: K,
    listener: SseListener<BiddingSseEventMap[K]>,
  ): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit<K extends keyof BiddingSseEventMap>(event: K, data: BiddingSseEventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers)
      return;
    for (const handler of Array.from(handlers)) {
      try {
        handler(data);
      }
      catch (err) {
        Logger.error('SSE_LISTENER_ERROR', `Error in handler for ${String(event)}`, err);
      }
    }
  }

  /**
   * Connect to the SSE stream.
   * PR42-08: Protected by single-flight connectionPromise to prevent concurrent duplicate socket creations.
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

    const generation = ++this.generation;
    this.connectionPromise = (async () => {
      try {
        this.clearTimers();
        this.cleanupActiveConnection();
        await this.startStream(generation);
      }
      finally {
        if (generation === this.generation)
          this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Disconnect and abort any ongoing stream.
   */
  public disconnect(): void {
    this.isClosed = true;
    this.generation += 1;
    this.connectionPromise = null;
    this.cleanupActiveConnection();
    this.clearTimers();
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
      Logger.warn('SSE_HEARTBEAT_TIMEOUT', `No event or keepalive received in ${this.heartbeatTimeoutMs}ms. Reconnecting.`);
      this.cleanupActiveConnection();
      this.scheduleReconnect();
    }, this.heartbeatTimeoutMs);
  }

  private scheduleReconnect(immediate = false): void {
    if (this.isClosed || !this.autoReconnect)
      return;
    this.clearTimers();

    const delay = immediate ? 0 : calculateBackoffDelay(this.reconnectAttempt, this.maxBackoffMs);
    this.reconnectAttempt += 1;

    Logger.debug('SSE_RECONNECT_SCHEDULED', `Reconnecting in ${delay}ms (attempt #${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private async startStream(generation: number): Promise<void> {
    if (this.isClosed)
      return;

    let token = getToken()?.access;
    if (!token) {
      Logger.warn('SSE_NO_TOKEN', 'No access token available for SSE stream. Attempting refresh...');
      try {
        token = await refreshTokens();
      }
      catch (err) {
        Logger.error('SSE_AUTH_HALTED', 'No valid token and refresh failed. Halting reconnection.', err);
        this.emit('error', new Error('Authentication required: no access token available'));
        this.clearTimers();
        return;
      }
    }

    if (this.isClosed || generation !== this.generation)
      return;

    const url = `${this.baseUrl}/bids/requests/${encodeURIComponent(this.requestId)}/events`;

    const parser = new SseStreamParser();
    parser.onComment = (_comment) => {
      this.resetHeartbeatWatchdog();
    };
    parser.onEvent = (eventName, rawData) => {
      this.resetHeartbeatWatchdog();
      this.handleParsedEvent(eventName, rawData);
    };

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      // MOB-FIX-01: In React Native environment (Platform.OS !== 'web'),
      // XMLHttpRequest (streamViaXhr) MUST be used as the primary streaming transport
      // because React Native fetch does not support WHATWG ReadableStream getReader().
      // On Web (Platform.OS === 'web'), use fetch if getReader is available; otherwise XHR.
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

      Logger.warn('SSE_STREAM_ERROR', 'Stream failed with error', err?.message || err);
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
      Logger.warn('SSE_AUTH_EXPIRED', 'SSE connection 401 Unauthorized. Refreshing token...');
      try {
        await refreshTokens();
        this.scheduleReconnect(true);
        return;
      }
      catch (refreshErr) {
        Logger.error('SSE_REFRESH_FAILED', 'Token refresh failed during SSE reconnect', refreshErr);
        this.emit('error', new Error('Authentication expired and token refresh failed'));
        this.clearTimers();
        return;
      }
    }

    if (!response.ok) {
      throw new Error(`SSE HTTP error status: ${response.status} ${response.statusText}`);
    }

    this.onStreamOpened();

    // Check if response.body has getReader (standard stream)
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

      while (!this.isClosed && !signal.aborted) {
        const { done, value } = await reader.read();
        if (done)
          break;
        if (value) {
          const chunk = decoder
            ? decoder.decode(value, { stream: true })
            : String.fromCharCode(...value);
          parser.feed(chunk);
        }
      }
    }
    else {
      // Fallback: never use response.text() as it hangs on infinite SSE streams!
      Logger.warn('SSE_FETCH_NO_READER', 'Fetch response.body.getReader not available. Falling back to XMLHttpRequest.');
      this.streamViaXhr(url, token, parser);
      return;
    }

    if (!this.isClosed && !signal.aborted) {
      Logger.debug('SSE_STREAM_ENDED', 'Stream ended naturally. Reconnecting...');
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

    xhr.onreadystatechange = () => {
      if (this.isClosed || this.activeXhr !== xhr)
        return;

      if (xhr.readyState === 2) {
        // Headers received
        if (xhr.status === 401) {
          isAbortingForAuth = true;
          this.activeXhr = null;
          const generation = this.generation;
          try {
            xhr.abort();
          }
          catch {}
          Logger.warn('SSE_XHR_401', 'XHR received 401 Unauthorized. Refreshing tokens...');
          refreshTokens()
            .then(() => {
              if (generation === this.generation)
                this.scheduleReconnect(true);
            })
            .catch((err) => {
              Logger.error('SSE_REFRESH_FAILED', 'Token refresh failed during XHR SSE reconnect', err);
              this.emit('error', new Error('Authentication expired and token refresh failed'));
              this.clearTimers();
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
    this.emit('open', undefined as void);
  }

  private handleParsedEvent(eventName: string, rawData: string): void {
    try {
      const parsedData = rawData ? JSON.parse(rawData) : {};

      switch (eventName) {
        case 'sync.required':
          if (parsedData.requestId === this.requestId)
            this.emit('sync.required', parsedData as SseSyncRequiredEvent);
          break;
        case 'ready':
          this.emit('ready', parsedData as SseReadyEvent);
          break;
        case 'bid.changed':
          this.emit('bid.changed', parsedData as SseBidChangedEvent);
          break;
        case 'round.changed':
          this.emit('round.changed', parsedData as SseRoundChangedEvent);
          break;
        case 'matching.changed':
          this.emit('matching.changed', parsedData as SseMatchingChangedEvent);
          break;
        default:
          Logger.debug('SSE_UNKNOWN_EVENT', `Received unhandled event: ${eventName}`, parsedData);
          break;
      }
    }
    catch (parseErr) {
      Logger.warn('SSE_DATA_PARSE_ERROR', `Failed to parse SSE JSON for ${eventName}: ${rawData}`, parseErr);
    }
  }

  public getIsOpen(): boolean {
    return this.isConnected && !this.isClosed;
  }
}
