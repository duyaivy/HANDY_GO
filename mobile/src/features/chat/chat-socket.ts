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
  private lastRefresh = 0;
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
      this.socket.on('connect', this.notify);
      this.socket.on('disconnect', (reason) => {
        this.notify();
        if (reason === 'io server disconnect')
          void this.refresh();
      });
      this.socket.on('connect_error', (error) => {
        this.notify();
        if (
          (error as Error & { data?: { code?: string } }).data?.code
          === 'UNAUTHORIZED'
        ) {
          void this.refresh();
        }
      });
    }
  }

  start() {
    this.active = true;
    if (!getToken()?.access)
      return;
    this.initialize();
    this.socket?.connect();
  }

  private async refresh() {
    if (!this.active || Date.now() - this.lastRefresh < 30000)
      return;
    this.lastRefresh = Date.now();
    try {
      await refreshTokens();
      if (this.active && getToken()?.access)
        this.socket?.connect();
    }
    catch {
      this.stop();
    }
  }

  stop() {
    this.active = false;
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
