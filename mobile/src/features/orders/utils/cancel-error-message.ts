import { ApiError } from '@/services/api/api-error';

export function getCancelErrorMessage(error: unknown): string {
  if (!error) {
    return 'Không thể hủy yêu cầu vào lúc này. Vui lòng thử lại sau.';
  }

  const err = error as any;
  const code = (err instanceof ApiError ? err.code : (err.code || err.response?.data?.code))?.toString()?.toUpperCase() || '';
  const status = err.statusCode || err.status || err.response?.status;
  const rawMessage = (err.message || err.response?.data?.message || '').toString();

  // Network / Timeout
  if (
    err.kind === 'TIMEOUT_ERROR'
    || code === 'TIMEOUT'
    || code === 'ECONNABORTED'
    || /timeout/i.test(rawMessage)
  ) {
    return 'Yêu cầu xử lý quá thời gian chờ. Vui lòng kiểm tra lại danh sách đơn hàng.';
  }

  if (
    err.kind === 'NETWORK_ERROR'
    || code === 'NETWORK_ERROR'
    || /network|kết nối|offline/i.test(rawMessage)
  ) {
    return 'Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.';
  }

  // Not Found
  if (
    code === 'ORDER_NOT_FOUND'
    || code === 'SERVICE_REQUEST_NOT_FOUND'
    || code === 'REQUEST_NOT_FOUND'
    || status === 404
  ) {
    return 'Không tìm thấy yêu cầu dịch vụ hoặc yêu cầu đã bị xóa.';
  }

  // Permission
  if (
    code === 'NOT_REQUEST_OWNER'
    || code === 'NOT_ORDER_OWNER'
    || code === 'FORBIDDEN'
    || status === 403
  ) {
    return 'Bạn không có quyền thao tác trên yêu cầu này.';
  }

  // Already cancelled
  if (
    code === 'ORDER_ALREADY_CANCELLED'
    || code === 'REQUEST_ALREADY_CANCELLED'
    || /already cancelled/i.test(rawMessage)
  ) {
    return 'Yêu cầu này đã được hủy trước đó.';
  }

  // Worker accepted
  if (code === 'WORKER_ACCEPTED') {
    return 'Thợ vừa chấp nhận đơn, vui lòng kiểm tra lại trạng thái đơn hàng.';
  }

  // In progress
  if (
    code === 'ORDER_IN_PROGRESS'
    || /converted to an order|in_progress/i.test(rawMessage)
  ) {
    return 'Thợ đã bắt đầu thực hiện công việc, không thể hủy tự động. Vui lòng liên hệ hỗ trợ.';
  }

  if (code === 'INVALID_STATE_TRANSITION' || status === 409) {
    return 'Trạng thái yêu cầu đã thay đổi trên hệ thống. Vui lòng làm mới lại trang.';
  }

  if (status >= 500 || err.kind === 'SERVER_ERROR') {
    return 'Máy chủ đang bảo trì hoặc gặp sự cố. Vui lòng thử lại sau.';
  }

  // Allow clean Vietnamese messages that don't contain English technical terms
  const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(rawMessage);
  if (hasVietnamese && !/error|failed|cannot|timeout|internal/i.test(rawMessage)) {
    return rawMessage;
  }

  return 'Không thể hủy yêu cầu vào lúc này. Vui lòng thử lại sau.';
}
