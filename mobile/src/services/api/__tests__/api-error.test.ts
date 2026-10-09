import { ApiError, ERROR_CODES } from '../api-error';

describe('api error response envelope', () => {
  it('reads business metadata from the shared data field', () => {
    const error = ApiError.fromAxiosError({
      response: {
        status: 424,
        data: {
          statusCode: 424,
          code: ERROR_CODES.OTP_DELIVERY_FAILED,
          message: 'Không gửi được OTP',
          data: {
            verification: {
              challengeId: 'challenge-1',
              phone: '+84912345678',
              emailMasked: 'c***r@example.com',
              resendAvailableAt: '2026-10-07T10:00:00.000Z',
            },
          },
        },
      },
    });

    expect(error.code).toBe(ERROR_CODES.OTP_DELIVERY_FAILED);
    expect(error.details?.verification?.challengeId).toBe('challenge-1');
  });

  it('reads validation field errors from data', () => {
    const error = ApiError.fromAxiosError({
      response: {
        status: 400,
        data: {
          statusCode: 400,
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Dữ liệu không hợp lệ',
          data: {
            fieldErrors: { email: ['Email không hợp lệ'] },
          },
        },
      },
    });

    expect(error.fieldErrors).toEqual({ email: ['Email không hợp lệ'] });
  });
});
