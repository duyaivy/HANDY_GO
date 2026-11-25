import { HttpError } from "@/shared/api/http";
import type { PaymentMethod, PaymentStatus } from "./types";

export const PAYMENT_STATUSES = {
  pending: { label: "Chờ thanh toán", color: "bg-amber-50 text-amber-700" },
  processing: { label: "Đang xử lý", color: "bg-blue-50 text-blue-700" },
  succeeded: { label: "Thành công", color: "bg-green-50 text-green-700" },
  failed: { label: "Thất bại", color: "bg-red-50 text-red-700" },
  cancelled: { label: "Đã hủy", color: "bg-slate-100 text-slate-600" },
  partially_refunded: {
    label: "Hoàn tiền một phần",
    color: "bg-violet-50 text-violet-700",
  },
  refunded: { label: "Đã hoàn tiền", color: "bg-violet-50 text-violet-700" },
} satisfies Record<PaymentStatus, { label: string; color: string }>;

export const PAYMENT_METHODS = {
  cash: "Tiền mặt",
  point: "Điểm",
} satisfies Record<PaymentMethod, string>;

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function formatPaymentDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

export function formatPaymentAmount(amount: string, currency: string) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(
    BigInt(amount),
  );
}

export function getPaymentErrorMessage(error: Error, fallback: string) {
  if (error instanceof HttpError) {
    if (error.status === 401) return "Vui lòng đăng nhập để tra cứu giao dịch.";
    if (error.status === 403) return "Bạn không có quyền xem giao dịch thanh toán.";
    if (error.status === 404) return "Không tìm thấy dữ liệu thanh toán.";
  }
  return fallback;
}
