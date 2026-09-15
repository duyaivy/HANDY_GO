import { RoleType } from "@/shared/types/jwt.types";

// Re-export for convenience so consumers only need one import
export type { RoleType };

export interface AuthPayload {
  token: string;
}

export interface ChatSendPayload {
  message: string;
  table_number?: number;
}

export interface ChatMessageEventPayload {
  message: string;
  sender_role: RoleType;
  sender_id: number;
  table_number: number;
}

export interface ChatMessagePayload {
  message: string;
  sender: string;
  role: RoleType;
  sender_id?: number;
  table_number: number;
  timestamp: string;
}

export interface ChatErrorPayload {
  message: string;
  code?: string;
}

export interface OrderNotificationPayload {
  id?: number | string;
  status?: string;
  table_number?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}
