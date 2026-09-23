import { io, Socket } from "socket.io-client";
import envConfig from "@/shared/config/env";

/**
 * Singleton socket instance keyed by token.
 * We only create one socket per token; if the token changes (e.g. after
 * refresh) we disconnect the old instance and create a new one.
 */
let currentSocket: Socket | null = null;
let currentToken: string | null = null;

/**
 * Returns a Socket.IO client that authenticates with `token`.
 *
 * Design mirrors `lib/http.ts`:
 *   – One singleton per session (not per component render).
 *   – autoConnect: false so connection is deferred until the provider calls
 *     socket.connect() once it has confirmed a valid token.
 */
export function getSocketClient(token: string): Socket {
  // Reuse the existing socket if same token
  if (currentSocket && currentToken === token) {
    return currentSocket;
  }

  // Tear down the previous socket if the token changed
  if (currentSocket) {
    currentSocket.disconnect();
    currentSocket = null;
  }

  const baseUrl = envConfig.NEXT_PUBLIC_SOCKET_ENDPOINT;

  currentSocket = io(baseUrl, {
    path: "/socket.io",
    auth: { token },
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  currentToken = token;
  return currentSocket;
}

/** Tear down singleton (called on logout / token expiry). */
export function destroySocketClient(): void {
  if (currentSocket) {
    currentSocket.disconnect();
    currentSocket = null;
    currentToken = null;
  }
}
