export type OrderStatus =
  | "created"
  | "confirmed"
  | "in_progress"
  | "awaiting_customer_confirmation"
  | "completed"
  | "cancelled"
  | "disputed";

export type PaymentState =
  | "unpaid"
  | "pending"
  | "paid"
  | "refunded"
  | "failed";

export type DisputeAction = "resume_previous_state" | "cancel" | "complete";

export interface Order {
  id: string;
  orderCode: string;
  service: string;
  customer: string;
  worker: string;
  customerName?: string;
  workerName?: string;

  // Trạng thái tải thông tin người dùng
  customerNameLoading?: boolean;
  workerNameLoading?: boolean;
  price: number;
  status: OrderStatus;
  paymentState: PaymentState;
  createdAt: string;
  address: string;
  disputeReason?: string;
  previousStatus?: OrderStatus;
  evidenceCount: number;
  resolutionNote?: string;
}

export interface OrderQuery {
  page: number;
  limit: number;
  status?: string;
  paymentState?: PaymentState;
  customerUserId?: string;
  workerUserId?: string;
}

export interface OrderListResponse {
  items: OrderResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OrderResponse {
  id: string;
  orderCode: string;
  customerUserId: string;
  workerUserId: string;
  serviceId: string;
  agreedPrice: string;
  agreedScope: string;
  scheduledAt?: string | null;
  addressText: string;
  status: OrderStatus;
  paymentState: PaymentState;
  disputeReason?: string | null;
  disputePreviousStatus?: OrderStatus | null;
  disputeResolutionNote?: string | null;
  createdAt: string;
  evidences?: OrderEvidence[];
  statusHistory?: OrderStatusHistoryItem[];
}

export interface OrderDetail extends OrderResponse {
  serviceRequestId: string;
  bookingProposalId: string;
  selectionSource: string;
  selectedBidId?: string | null;
  selectedMatchResultId?: string | null;
  latitude: number;
  longitude: number;
  confirmedAt?: string | null;
  startedAt?: string | null;
  workerFinishedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  disputedAt?: string | null;
  disputeResolvedAt?: string | null;
  updatedAt: string;
}

export interface OrderEvidence {
  id: string;
  orderId: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  description?: string | null;
  createdAt: string;
}

export interface OrderStatusHistoryItem {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: string;
}
