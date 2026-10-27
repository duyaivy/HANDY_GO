export type RequestStatus
  = 'draft'
    | 'open_for_bidding'
    | 'bidding_closed'
    | 'converted_to_order'
    | 'cancelled'
    | 'expired';

export type BookingProposalStatus
  = 'proposed'
    | 'changes_requested'
    | 'worker_rejected'
    | 'withdrawn'
    | 'expired'
    | 'finalized'
    | 'superseded';

export type WorkerSelectionSource = 'bid' | 'recommendation';

export type OrderStatus
  = 'created'
    | 'confirmed'
    | 'in_progress'
    | 'awaiting_customer_confirmation'
    | 'completed'
    | 'cancelled'
    | 'disputed';

export type PaymentState
  = 'unpaid'
    | 'pending'
    | 'paid'
    | 'refunded'
    | 'failed';

export type ServiceRequestMedia = {
  id?: string;
  serviceRequestId?: string;
  mediaType: string;
  mediaUrl: string;
  createdAt?: string;
};

export type ServiceRequest = {
  id: string;
  requestCode: string;
  customerUserId: string;
  serviceId?: string | null;
  description?: string | null;
  scheduledAt?: string | null;
  aiRefPriceMin?: number | string | null;
  aiRefPriceMax?: number | string | null;
  addressText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: RequestStatus;
  publishedAt?: string | null;
  biddingClosesAt?: string | null;
  selectionExpiresAt?: string | null;
  media?: ServiceRequestMedia[];
  createdAt: string;
  updatedAt?: string;
};

export type BookingProposal = {
  id: string;
  serviceRequestId: string;
  supersedesProposalId?: string | null;
  revisionNo: number;
  customerUserId: string;
  workerUserId: string;
  selectionSource: WorkerSelectionSource;
  sourceBidId?: string | null;
  sourceMatchResultId?: string | null;
  agreedPrice: number | string;
  agreedScope: string;
  scheduledAt?: string | null;
  status: BookingProposalStatus;
  expiresAt: string;
  workerRespondedAt?: string | null;
  finalizedAt?: string | null;
  responseNote?: string | null;
  createdAt: string;
  updatedAt?: string;
  serviceRequest?: ServiceRequest;
};

export type OrderEvidence = {
  id: string;
  orderId: string;
  mediaType: string;
  mediaUrl: string;
  description?: string | null;
  createdAt: string;
};

export type OrderStatusHistoryItem = {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedByUserId?: string | null;
  reason?: string | null;
  createdAt: string;
};

export type Order = {
  id: string;
  orderCode: string;
  serviceRequestId: string;
  bookingProposalId: string;
  customerUserId: string;
  workerUserId: string;
  serviceId?: string | null;
  agreedPrice: number | string;
  agreedScope: string;
  addressText: string;
  latitude?: number | null;
  longitude?: number | null;
  status: OrderStatus;
  paymentState: PaymentState;
  confirmedAt?: string | null;
  startedAt?: string | null;
  workerFinishedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  disputedAt?: string | null;
  disputeReason?: string | null;
  evidences?: OrderEvidence[];
  statusHistory?: OrderStatusHistoryItem[];
  createdAt: string;
  updatedAt?: string;
};

export type CreateServiceRequestPayload = {
  serviceId?: string;
  description?: string;
  scheduledAt?: string;
  addressText?: string;
  latitude?: number;
  longitude?: number;
  aiRefPriceMin?: number;
  aiRefPriceMax?: number;
  media?: Array<{
    mediaUrl: string;
    mediaType: string;
  }>;
};

export type CreateBookingProposalPayload = {
  serviceRequestId: string;
  workerUserId: string;
  selectionSource: WorkerSelectionSource;
  agreedPrice: number;
  agreedScope: string;
  scheduledAt?: string;
  sourceBidId?: string;
  sourceMatchResultId?: string;
  expiresAt?: string;
  supersedesProposalId?: string;
  autoAccept?: boolean;
};

export type UploadEvidencePayload = {
  mediaUrl: string;
  mediaType: string;
  description?: string;
};

export type PaginatedList<T> = {
  items: T[];
  total: number;
  page: number;
  limit?: number;
  totalPages: number;
};
