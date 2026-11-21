import { HttpError } from "@/shared/api/http";
import type { RefundStatus } from "./types/refund";

export const REFUND_STATUSES = {
  pending: { label: "Chờ duyệt", color: "bg-amber-50 text-amber-700" },
  needs_review: { label: "Đang xử lý", color: "bg-blue-50 text-blue-700" },
  processing: { label: "Đang xử lý", color: "bg-blue-50 text-blue-700" },
  completed: { label: "Đã hoàn tiền", color: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Thất bại", color: "bg-red-50 text-red-700" },
  cancelled: { label: "Đã từ chối", color: "bg-slate-100 text-slate-600" },
} satisfies Record<RefundStatus, { label: string; color: string }>;

export function getRefundErrorMessage(error: Error, fallback: string) {
  if (error instanceof HttpError) {
    if (error.status === 401) return "Vui lòng đăng nhập để quản lý hoàn tiền.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác hoàn tiền này.";
    if (error.status === 404) return "Không tìm thấy giao dịch hoặc yêu cầu hoàn tiền.";
    if (error.status === 409) return "Dữ liệu hoàn tiền đã thay đổi hoặc không còn hợp lệ.";
  }
  return fallback;
}
