export type RefundStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "needs_review";

export type Refund = {
  id: string;
  paymentId: string;
  amount: string;
  status: RefundStatus;
  destination: "point";
  reason: string;
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectedByUserId: string | null;
  rejectedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  refundedAt: string | null;
};

export type RefundListResponse = {
  items: Refund[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type RefundListParams = {
  page: number;
  limit: number;
  paymentId?: string;
  statuses?: RefundStatus[];
};

export type CreateRefundInput = {
  amount: string;
  reason: string;
  idempotencyKey: string;
};

export type RefundDecisionInput = { approve: boolean; reason: string };
