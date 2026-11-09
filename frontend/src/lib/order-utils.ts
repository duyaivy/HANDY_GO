import { OrderStatus, PaymentState } from "@/feature/orders/types";



export const STATUS_LABELS: Record<OrderStatus, string> = {
  created: "Mới tạo",
  confirmed: "Đã xác nhận",
  in_progress: "Đang thực hiện",
  awaiting_customer_confirmation: "Chờ khách xác nhận",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  disputed: "Tranh chấp",
};

export const PAYMENT_LABELS: Record<PaymentState, string> = {
  unpaid: "Chưa thanh toán",
  pending: "Đang xử lý",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
  failed: "Thất bại",
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  created: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  awaiting_customer_confirmation: "bg-violet-50 text-violet-700",
  completed: "bg-green-50 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
  disputed: "bg-red-50 text-red-700",
};

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
