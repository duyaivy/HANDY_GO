/** Phase 1 wire contracts only. Sequence values are canonical PostgreSQL bigint decimal strings. */
export type ChatSequence = string;
export type ChatMessageType = 'TEXT' | 'IMAGE' | 'VIDEO';
export type ChatConversationStatus = 'OPEN' | 'READ_ONLY';
export interface ConversationCreateInput {
  bidId: string;
}
export interface ConversationInput {
  conversationId: string;
}
export interface AttachmentReference {
  storageKey: string;
}
export interface MessageSendInput extends ConversationInput {
  clientMessageId: string;
  messageType: ChatMessageType;
  content?: string;
  replyToId?: string;
  attachments?: AttachmentReference[];
}
export interface MessageReadInput extends ConversationInput {
  lastReadSequence: ChatSequence;
}
export interface ConversationListQuery {
  limit?: number;
  cursor?: string;
}
export interface MessageListQuery {
  limit?: number;
  beforeSequence?: ChatSequence;
  afterSequence?: ChatSequence;
}
export interface ChatAttachment {
  id: string;
  storageKey: string;
  mediaType: 'IMAGE' | 'VIDEO';
  mimeType: string;
  sizeBytes: number;
  position: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Unavailable assets retain metadata but never expose a stale URL. */
  unavailable?: boolean;
  url: string | null;
  urlExpiresAt: string | null;
}
export interface ReplyPreview {
  id: string;
  senderId: string | null;
  messageType: ChatMessageType | null;
  content: string | null;
  unavailable: boolean;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  sequence: ChatSequence;
  messageType: ChatMessageType;
  content: string | null;
  replyToId: string | null;
  reply: ReplyPreview | null;
  attachments: ChatAttachment[];
  createdAt: string;
}
export interface ChatReadState extends MessageReadInput {
  userId: string;
  updatedAt: string;
}
export interface ChatConversation {
  customerName?: string;
  workerName?: string;
  customerAvatarUrl?: string | null;
  workerAvatarUrl?: string | null;
  serviceName?: string;
  id: string;
  requestId: string;
  orderId: string | null;
  customerId: string;
  workerId: string;
  status: ChatConversationStatus;
  lastSequence: ChatSequence;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: { read: boolean; send: boolean; reason: string | null };
  readStates: ChatReadState[];
}
export interface ChatPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface MessageHistoryPage {
  items: ChatMessage[];
  nextBeforeSequence: ChatSequence | null;
  nextAfterSequence: ChatSequence | null;
  highWaterSequence: ChatSequence;
}
/** Identical envelope to ApiResponseEnvelope; no runtime Nest dependency for Mobile. */
export interface ChatEnvelope<T> {
  statusCode: number;
  message: string;
  data: T;
  code?: string;
}
export type ChatErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'CONVERSATION_NOT_FOUND'
  | 'CHAT_INELIGIBLE'
  | 'CHAT_READ_ONLY'
  | 'ELIGIBILITY_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REPLY_NOT_FOUND'
  | 'MEDIA_UNVERIFIED'
  | 'CONTACT_INFORMATION_BLOCKED'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';
export type ChatAck<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ChatErrorCode;
        message: string;
        retryable: boolean;
        retryAfterMs?: number;
      };
    };
export interface MessageSendResult {
  message: ChatMessage;
  duplicate: boolean;
}
export interface TypingUpdate extends ConversationInput {
  userId: string;
  isTyping: boolean;
  expiresAt: string;
}
export interface ClientToServerChatEvents {
  'conversation.join': (
    input: ConversationInput,
    ack: (
      value: ChatAck<{
        conversation: ChatConversation;
        highWaterSequence: ChatSequence;
      }>,
    ) => void,
  ) => void;
  'conversation.leave': (
    input: ConversationInput,
    ack: (value: ChatAck<ConversationInput>) => void,
  ) => void;
  'message.send': (
    input: MessageSendInput,
    ack: (value: ChatAck<MessageSendResult>) => void,
  ) => void;
  'message.read': (
    input: MessageReadInput,
    ack: (value: ChatAck<ChatReadState>) => void,
  ) => void;
  'typing.start': (
    input: ConversationInput,
    ack: (value: ChatAck<ConversationInput>) => void,
  ) => void;
  'typing.stop': (
    input: ConversationInput,
    ack: (value: ChatAck<ConversationInput>) => void,
  ) => void;
}
export interface ServerToClientChatEvents {
  'message.new': (message: ChatMessage) => void;
  'message.read.updated': (state: ChatReadState) => void;
  'typing.update': (typing: TypingUpdate) => void;
}
export interface ChatEligibilitySnapshot {
  customerId: string;
  workerId: string;
  bidStatus: string | null;
  /** Current active-bid status, validUntil and noncanceled round verified by Bidding. */
  bidCurrentlyValid: boolean;
  requestStatus: string;
  selectedWorkerId: string | null;
  orderStatus: string | null;
  /** Set only after internal authority revalidation, never from a client or cached event. */
  verified: boolean;
  userActive: boolean;
  conversationExists: boolean;
  completionWindowOpen: boolean;
}
export interface VerifiedChatMedia {
  storageKey: string;
  ownerId: string;
  verified: boolean;
  ready: boolean;
  private: boolean;
  mediaType: 'IMAGE' | 'VIDEO';
  mimeType: string;
  sizeBytes: number;
}
/** Proposed Phase 2 event. Existing DomainEvent conventions plus explicit routing/correlation. */
export interface MessageCreatedEvent {
  eventId: string;
  eventType: 'message.created';
  eventVersion: 1;
  producer: 'message-service';
  occurredAt: string;
  correlationId: string;
  data: {
    messageId: string;
    conversationId: string;
    requestId: string;
    orderId: string | null;
    senderId: string;
    recipientId: string;
    sequence: ChatSequence;
    messageType: ChatMessageType;
  };
}
/** Proposed authenticated authority HTTP responses; no endpoint is implemented in Phase 1. */
export interface ChatBidAuthority {
  bidId: string;
  requestId: string;
  workerId: string;
  status: 'active' | 'withdrawn' | 'expired' | 'selected' | 'rejected';
  version: number;
  submittedAt: string;
  validUntil: string | null;
  roundStatus:
    'pending' | 'open' | 'closed' | 'no_bid' | 'finalized' | 'cancelled';
  eligible: boolean;
  verifiedAt: string;
}
export interface ChatRequestAuthority {
  serviceId?: string;
  requestId: string;
  customerId: string;
  status: string;
  version: number;
  order: null | {
    orderId: string;
    workerId: string;
    status: string;
    version: number;
    completedAt: string | null;
  };
  verifiedAt: string;
}
/** Consumed subset of actual existing v1 payloads; producers may include additional fields. */
export interface ExistingChatLifecycleData {
  'bid.submitted': {
    bidId: string;
    biddingRoundId: string;
    serviceRequestId: string;
    requestId: string;
    customerId: string | null;
    workerId: string;
    submittedAt: string;
    validUntil: string | null;
  };
  'bid.revised': {
    bidId: string;
    serviceRequestId: string;
    requestId: string;
    customerId: string | null;
    workerId: string;
    version: number;
    revisedAt: string;
  };
  'bid.withdrawn': {
    bidId: string;
    serviceRequestId: string;
    requestId: string;
    customerId: string | null;
    workerId: string;
    version: number;
    withdrawnAt: string;
  };
  'service_request.cancelled': {
    serviceRequestId: string;
    requestId: string;
    customerUserId: string;
    cancelledAt: string;
  };
  'order.created': {
    orderId: string;
    serviceRequestId: string;
    requestId: string;
    customerId: string;
    workerId: string;
    selectionSource: 'bid' | 'recommendation';
    selectedBidId: string | null;
    createdAt: string;
  };
  'order.status.changed': {
    orderId: string;
    customerId: string;
    workerId: string;
    previousStatus: string;
    nextStatus: string;
    notificationKind: string;
  };
  'order.completed': {
    orderId: string;
    customerId: string;
    workerId: string;
    completedAt: string;
  };
  'order.cancelled': {
    orderId: string;
    customerId: string;
    workerId: string;
    cancelledAt: string;
  };
}
export type ExistingChatLifecycleEvent<
  K extends keyof ExistingChatLifecycleData = keyof ExistingChatLifecycleData,
> = K extends keyof ExistingChatLifecycleData
  ? {
      eventId: string;
      eventVersion: 1;
      producer: 'bidding-service' | 'order-service';
      occurredAt: string;
      correlationId?: string;
      data: ExistingChatLifecycleData[K];
    }
  : never;
