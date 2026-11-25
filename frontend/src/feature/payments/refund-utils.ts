import { HttpError } from "@/shared/api/http";
import type { RefundStatus } from "./types/refund";

export const REFUND_STATUSES = {
  pending: {
    label: "Chờ duyệt",
    color: "bg-amber-50 text-amber-700",
  },
  needs_review: {
    label: "Cần xem xét",
    color: "bg-orange-100 text-orange-800",
  },
  processing: {
    label: "Đang xử lý",
    color: "bg-blue-50 text-blue-700",
  },
  completed: {
    label: "Đã hoàn tiền",
    color: "bg-emerald-50 text-emerald-700",
  },
  failed: {
    label: "Thất bại",
    color: "bg-red-50 text-red-700",
  },
  cancelled: {
    label: "Đã từ chối",
    color: "bg-slate-100 text-slate-600",
  },
} satisfies Record<RefundStatus, { label: string; color: string }>;

export type CreateRefundErrorClassification =
  | {
      kind: "definitive_rejection";
      reason: "validation" | "exceeds_capacity" | "payment_not_eligible";
      message: string;
    }
  | {
      kind: "idempotency_conflict";
      message: string;
    }
  | {
      kind: "ambiguous_outcome";
      message: string;
    };

const NON_JSON_ERROR_MESSAGE = "Backend trả về dữ liệu không phải JSON";

export function getRefundErrorMessage(error: Error, fallback: string) {
  if (error instanceof HttpError) {
    if (error.status === 401) return "Vui lòng đăng nhập để quản lý hoàn tiền.";

    if (error.status === 403)
      return "Bạn không có quyền thực hiện thao tác hoàn tiền này.";

    if (error.status === 404)
      return "Không tìm thấy giao dịch hoặc yêu cầu hoàn tiền.";

    if (error.status === 409)
      return "Dữ liệu hoàn tiền đã thay đổi hoặc không còn hợp lệ.";
  }

  return fallback;
}

/**
 * Phân loại lỗi tạo refund theo contract Backend (refunds.service.ts):
 * - Không giải phóng pending operation chỉ dựa vào HTTP status (đặc biệt với 403/404 hoặc khi đang retry).
 * - Chỉ giải phóng tự động khi Backend xác nhận từ chối nghiệp vụ chắc chắn theo contract
 *   (409 vượt hạn mức / trạng thái payment không hợp lệ, hoặc validation ở lần gửi mới).
 */
export function classifyCreateRefundError(
  error: unknown,
  options: { isRetry: boolean },
): CreateRefundErrorClassification {
  if (!(error instanceof HttpError)) {
    return {
      kind: "ambiguous_outcome",
      message:
        error instanceof Error && error.message
          ? error.message
          : "Không thể xác định kết quả tạo hoàn tiền.",
    };
  }

  const rawCode =
    typeof error.payload?.code === "string" ? error.payload.code.trim() : "";
  const rawMessage =
    typeof error.payload?.message === "string"
      ? error.payload.message.trim()
      : "";

  if (rawMessage === NON_JSON_ERROR_MESSAGE) {
    return {
      kind: "ambiguous_outcome",
      message: "Phản hồi từ máy chủ không hợp lệ, chưa thể xác định kết quả.",
    };
  }

  if (error.status === 409 && rawCode === "CONFLICT") {
    const normalized = rawMessage.toLowerCase();

    if (normalized === "refund reservations exceed the paid amount") {
      return {
        kind: "definitive_rejection",
        reason: "exceeds_capacity",
        message:
          "Số tiền hoàn vượt quá hạn mức còn lại do có yêu cầu hoàn tiền khác vừa được ghi nhận. Vui lòng điều chỉnh lại số tiền.",
      };
    }

    if (normalized === "only settled payments can be refunded") {
      return {
        kind: "definitive_rejection",
        reason: "payment_not_eligible",
        message: "Giao dịch không còn đủ điều kiện tạo yêu cầu hoàn tiền mới.",
      };
    }

    return {
      kind: "idempotency_conflict",
      message:
        "Mã chống trùng đã gắn với một yêu cầu khác hoặc dữ liệu đang xung đột. Hãy kiểm tra danh sách hoàn tiền trước khi thao tác tiếp.",
    };
  }

  if (error.status === 409) {
    return {
      kind: "idempotency_conflict",
      message:
        "Yêu cầu hoàn tiền gặp xung đột dữ liệu. Hãy kiểm tra danh sách hoàn tiền trước khi thao tác tiếp.",
    };
  }

  // Ở lần gửi mới (chưa từng gửi key này trước đó), lỗi validation có contract rõ từ BE
  // chứng minh request bị từ chối trước bước ghi nhận vào DB.
  // Khi đang retry một pending operation, không tự xóa kể cả với 400/422/403/404.
  if (
    !options.isRetry &&
    (error.status === 400 || error.status === 422) &&
    rawCode === "VALIDATION_ERROR"
  ) {
    return {
      kind: "definitive_rejection",
      reason: "validation",
      message:
        "Dữ liệu yêu cầu hoàn tiền không hợp lệ. Vui lòng kiểm tra và nhập lại.",
    };
  }

  // 403 / 404 / 401 / 429 / 5xx hoặc lỗi không có contract từ chối rõ:
  // giữ nguyên pending operation và yêu cầu đối chiếu danh sách hoàn tiền.
  return {
    kind: "ambiguous_outcome",
    message: getRefundErrorMessage(
      error,
      "Không thể xác định kết quả tạo hoàn tiền.",
    ),
  };
}
