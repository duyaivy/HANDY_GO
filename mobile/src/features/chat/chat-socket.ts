import type { Socket } from 'socket.io-client';
import type {
  ChatAck,
  ClientToServerChatEvents,
  ServerToClientChatEvents,
} from './types';
import { io } from 'socket.io-client';
import { getToken } from '@/lib/auth/utils';
import { refreshTokens } from '@/services/api/api-client';
import { resolveChatBaseUrl } from './chat-config';

type Listener = () => void;
class ChatSocketManager {
  private socket: Socket<
    ServerToClientChatEvents,
    ClientToServerChatEvents
  > | null = null;

  private active = false;
  private listeners = new Set<Listener>();
  private generation = 0;
  private refreshingGeneration: number | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  connected = () => Boolean(this.socket?.connected);
  onConnection(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify = () => {
    for (const listener of this.listeners) listener();
  };

  private initialize() {
    if (!this.socket) {
      this.socket = io(new URL(resolveChatBaseUrl()).origin, {
        path: '/api/v1/chat/socket.io/',
        autoConnect: false,
        auth: callback => callback({ token: getToken()?.access }),
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
        randomizationFactor: 0.5,
        timeout: 10000,
      });
      this.socket.on('connect', () => {
        this.retryDelay = 1000;
        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }
        this.notify();
      });
      this.socket.on('disconnect', (reason) => {
        this.notify();
        if (reason === 'io server disconnect')
          this.scheduleRefresh();
      });
      this.socket.on('connect_error', (error) => {
        this.notify();
        if (
          (error as Error & { data?: { code?: string } }).data?.code
          === 'UNAUTHORIZED'
        ) {
          this.scheduleRefresh();
        }
      });
    }
  }

  start() {
    this.active = true;
    if (!getToken()?.access)
      return;
    this.initialize();
    if (!this.retryTimer && this.refreshingGeneration !== this.generation)
      this.socket?.connect();
  }

  private scheduleRefresh() {
    if (!this.active || this.retryTimer)
      return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.refresh();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30000);
  }

  private async refresh() {
    if (!this.active || this.refreshingGeneration === this.generation)
      return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const generation = this.generation;
    this.refreshingGeneration = generation;
    try {
      await refreshTokens();
      if (this.active && generation === this.generation && getToken()?.access) {
        this.socket?.connect();
      }
    }
    catch (error) {
      if (!this.active || generation !== this.generation)
        return;
      const failure = error as { statusCode?: number; kind?: string };
      if (failure.kind === 'AUTH_ERROR' || [400, 401, 403, 422].includes(failure.statusCode ?? 0)) {
        this.stop();
        return;
      }
      this.scheduleRefresh();
    }
    finally {
      if (this.refreshingGeneration === generation)
        this.refreshingGeneration = null;
    }
  }

  stop() {
    this.active = false;
    this.generation++;
    this.retryDelay = 1000;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.socket?.disconnect();
    this.notify();
  }

  clear() {
    this.stop();
    this.socket?.removeAllListeners();
    this.socket = null;
  }

  subscribe<K extends keyof ServerToClientChatEvents>(
    event: K,
    listener: ServerToClientChatEvents[K],
  ) {
    this.initialize();
    const socket = this.socket;
    socket?.on(event, listener as never);
    return () => {
      socket?.off(event, listener as never);
    };
  }

  async request<T>(
    event: keyof ClientToServerChatEvents,
    input: unknown,
  ): Promise<T> {
    if (!this.socket?.connected)
      throw new Error('Socket unavailable');
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ACK timeout')), 10000);
      // The request/ACK pairing is defined by the shared event contracts.
      (this.socket!.emit as (...args: unknown[]) => void)(
        event,
        input,
        (ack: ChatAck<T>) => {
          clearTimeout(timer);
          if (ack.ok)
            resolve(ack.data);
          else reject(Object.assign(new Error(ack.error.message), ack.error));
        },
      );
    });
  }
}
export const chatSocket = new ChatSocketManager();
