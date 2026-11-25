export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

export type PaymentMethod = "cash" | "point";

export type PaymentRecord = {
  id: string;
  orderId: string;
  customerUserId: string;
  workerUserId: string;
  amount: string;
  currency: string;
  method: PaymentMethod | null;
  status: PaymentStatus;
  platformFee: string;
  workerEarning: string;
  orderCompletedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentQuery = {
  page: number;
  limit: number;
  status?: PaymentStatus[];
  method?: PaymentMethod;
};

export type PaymentListResponse = {
  items: PaymentRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
