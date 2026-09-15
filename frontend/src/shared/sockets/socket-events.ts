export const SOCKET_EVENTS = {
  CHAT_SEND: "chat_send",
  CHAT_MESSAGE: "chat_message",
  CHAT_ERROR: "chat_error",
  ORDER_CREATED: "order_created",
  ORDER_STATUS_UPDATED: "order_status_updated",
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  CONNECT_ERROR: "connect_error",
  RECONNECT: "reconnect",
} as const;
export type SocketEventKey = keyof typeof SOCKET_EVENTS;
export type SocketEventValue = (typeof SOCKET_EVENTS)[SocketEventKey];
