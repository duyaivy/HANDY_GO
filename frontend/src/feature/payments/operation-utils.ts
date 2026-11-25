import { HttpError } from "@/shared/api/http";

export const DEAD_LETTER_STATUS = {
  dead: { label: "Lỗi", color: "bg-red-50 text-red-700" },
  quarantined: { label: "Cách ly", color: "bg-amber-50 text-amber-700" },
} as const;

export function getOperationErrorMessage(error: Error, fallback: string) {
  if (error instanceof HttpError) {
    if (error.status === 401) return "Vui lòng đăng nhập để sử dụng chức năng vận hành.";
    if (error.status === 403) return "Bạn không có quyền thực hiện thao tác vận hành này.";
    if (error.status === 404) return "Không tìm thấy dữ liệu vận hành cần xử lý.";
  }
  return fallback;
}
