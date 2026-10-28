export interface PushMessage {
  jobId: string;
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  jobId: string;
  token: string;
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  shouldDeactivateToken: boolean;
  isTransient: boolean;
}

export abstract class PushProvider {
  abstract sendEach(messages: PushMessage[]): Promise<PushSendResult[]>;
  abstract shutdown(): Promise<void>;
}
