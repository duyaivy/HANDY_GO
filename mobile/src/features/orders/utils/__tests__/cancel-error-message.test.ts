import { ApiError } from '@/services/api/api-error';
import { getCancelErrorMessage } from '../cancel-error-message';

describe('getCancelErrorMessage', () => {
  it('returns default fallback message when error is undefined or null', () => {
    expect(getCancelErrorMessage(null)).toBe('Không thể hủy yêu cầu vào lúc này. Vui lòng thử lại sau.');
    expect(getCancelErrorMessage(undefined)).toBe('Không thể hủy yêu cầu vào lúc này. Vui lòng thử lại sau.');
  });

  it('handles ApiError instances with specific codes', () => {
    const notFoundError = new ApiError('NOT_FOUND', 'Not found', { code: 'REQUEST_NOT_FOUND', statusCode: 404 });
    expect(getCancelErrorMessage(notFoundError)).toBe('Không tìm thấy yêu cầu dịch vụ hoặc yêu cầu đã bị xóa.');

    const alreadyCancelledError = new ApiError('VALIDATION_ERROR', 'Already cancelled', { code: 'ORDER_ALREADY_CANCELLED', statusCode: 400 });
    expect(getCancelErrorMessage(alreadyCancelledError)).toBe('Yêu cầu này đã được hủy trước đó.');

    const inProgressError = new ApiError('VALIDATION_ERROR', 'In progress', { code: 'ORDER_IN_PROGRESS', statusCode: 400 });
    expect(getCancelErrorMessage(inProgressError)).toBe('Thợ đã bắt đầu thực hiện công việc, không thể hủy tự động. Vui lòng liên hệ hỗ trợ.');

    const workerAcceptedError = new ApiError('VALIDATION_ERROR', 'Worker accepted', { code: 'WORKER_ACCEPTED', statusCode: 400 });
    expect(getCancelErrorMessage(workerAcceptedError)).toBe('Thợ vừa chấp nhận đơn, vui lòng kiểm tra lại trạng thái đơn hàng.');

    const networkError = new ApiError('NETWORK_ERROR', 'Network connection failed', { code: 'NETWORK_ERROR', statusCode: 0 });
    expect(getCancelErrorMessage(networkError)).toBe('Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.');

    const timeoutError = new ApiError('TIMEOUT_ERROR', 'Timeout occurred', { code: 'TIMEOUT', statusCode: 408 });
    expect(getCancelErrorMessage(timeoutError)).toBe('Yêu cầu xử lý quá thời gian chờ. Vui lòng kiểm tra lại danh sách đơn hàng.');

    const forbiddenError = new ApiError('AUTH_ERROR', 'Forbidden', { code: 'FORBIDDEN', statusCode: 403 });
    expect(getCancelErrorMessage(forbiddenError)).toBe('Bạn không có quyền thao tác trên yêu cầu này.');
  });

  it('handles generic error objects or Axios-like response errors', () => {
    const axiosConflict = {
      status: 409,
      response: { data: { message: 'Conflict status' } },
    };
    expect(getCancelErrorMessage(axiosConflict)).toBe('Trạng thái yêu cầu đã thay đổi trên hệ thống. Vui lòng làm mới lại trang.');

    const serverError = {
      statusCode: 500,
      response: { data: { message: 'Internal Server Error' } },
    };
    expect(getCancelErrorMessage(serverError)).toBe('Máy chủ đang bảo trì hoặc gặp sự cố. Vui lòng thử lại sau.');

    const timeoutRegex = new Error('Gateway Timeout');
    expect(getCancelErrorMessage(timeoutRegex)).toBe('Yêu cầu xử lý quá thời gian chờ. Vui lòng kiểm tra lại danh sách đơn hàng.');

    const networkRegex = new Error('Network error');
    expect(getCancelErrorMessage(networkRegex)).toBe('Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.');
  });

  it('allows clean Vietnamese messages to pass through', () => {
    const viError = new Error('Tài khoản của bạn đã bị khóa tạm thời');
    expect(getCancelErrorMessage(viError)).toBe('Tài khoản của bạn đã bị khóa tạm thời');
  });

  it('falls back to Vietnamese default for unknown English errors', () => {
    const unknownError = new Error('some unexpected internal exception');
    expect(getCancelErrorMessage(unknownError)).toBe('Không thể hủy yêu cầu vào lúc này. Vui lòng thử lại sau.');
  });
});
