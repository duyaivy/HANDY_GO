
export type BookingStatusType =
  | "created"
  | "awaiting_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "disputed";

export type PaymentStateType =
  | "unpaid"
  | "pending"
  | "paid"
  | "refunded"
  | "failed";

export interface BookingOrderItem {
  id: string;
  code: string;
  customer: string;
  craftsman: string;
  service: string;
  serviceColorClass: string;

  // Giá trị số tương ứng với agreed_price trong DB
  price: number;

  // Trạng thái hiển thị và trạng thái thực tế trong DB
  status: string;
  statusType: BookingStatusType;

  // Tương ứng orders.payment_state
  paymentState: PaymentStateType;

  // Dùng cho bộ lọc thời gian, tương ứng orders.created_at
  createdAt: string;
}

// Giữ alias để không ảnh hưởng các component đang dùng OrderItem
export type OrderItem = BookingOrderItem;
