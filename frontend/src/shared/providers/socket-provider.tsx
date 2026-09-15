"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Socket } from "socket.io-client";
import { destroySocketClient, getSocketClient } from "@/shared/sockets/socket-client";
import { SOCKET_EVENTS } from "@/shared/sockets/socket-events";
import { getAccessTokenFromLocalStorage } from "@/shared/lib/utils";
import { toast } from "@/shared/ui/use-toast";

export interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  lastError: string | null;
}
const SocketContext = createContext<SocketContextType | undefined>(undefined);
export interface SocketProviderProps {
  children: React.ReactNode;
  /**
   * Called when the backend signals token expiry (401 connect_error).
   * Consumers should trigger logout via the existing auth context — never
   * hard-code router.push here so the provider stays auth-agnostic.
   */
  onTokenExpired?: () => void;
}
export function SocketProvider({
  children,
  onTokenExpired,
}: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const onTokenExpiredRef = useRef(onTokenExpired);
  useEffect(() => {
    onTokenExpiredRef.current = onTokenExpired;
  }, [onTokenExpired]);
  useEffect(() => {
    const token = getAccessTokenFromLocalStorage();
    // Do not attempt a connection when there is no token (unauthenticated users)
    if (!token) return;
    const newSocket = getSocketClient(token);
    setSocket(newSocket);
    setIsConnecting(true);
    newSocket.connect();

    const handleConnect = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setLastError(null);
    };

    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      setIsConnecting(false);
      // Socket was disconnected intentionally (e.g. server-side); not an error
      if (reason === "io server disconnect") {
        setLastError("Server closed the connection");
      }
    };

    const handleConnectError = (err: Error) => {
      setIsConnected(false);
      setIsConnecting(false);
      const msg = err.message ?? "";
      setLastError(msg);
      if (
        msg.toLowerCase().includes("401") ||
        msg.toLowerCase().includes("unauthorized")
      ) {
        onTokenExpiredRef.current?.();
        return;
      }
    };

    const handleReconnect = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setLastError(null);
    };
    newSocket.on(SOCKET_EVENTS.CONNECT, handleConnect);
    newSocket.on(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
    newSocket.on(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
    newSocket.on(SOCKET_EVENTS.RECONNECT, handleReconnect);
    return () => {
      // Remove only the listeners registered in this effect; never call
      // socket.removeAllListeners() because other hooks add their own.
      newSocket.off(SOCKET_EVENTS.CONNECT, handleConnect);
      newSocket.off(SOCKET_EVENTS.DISCONNECT, handleDisconnect);
      newSocket.off(SOCKET_EVENTS.CONNECT_ERROR, handleConnectError);
      newSocket.off(SOCKET_EVENTS.RECONNECT, handleReconnect);
      destroySocketClient();
    };
  }, []); // intentionally empty: socket lifecycle is tied to the provider mount
  return (
    <SocketContext.Provider
      value={{ socket, isConnected, isConnecting, lastError }}
    >
      {children}
    </SocketContext.Provider>
  );
}
export function useSocketContext(): SocketContextType {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocketContext must be used inside <SocketProvider>");
  }
  return ctx;
}
