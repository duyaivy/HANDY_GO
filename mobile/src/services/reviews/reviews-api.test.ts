import { ApiClient } from '@/services/api/api-client';
import { ApiError } from '@/services/api/api-error';
import { ReviewsApi } from './reviews-api';

afterEach(() => {
  jest.restoreAllMocks();
});

it('returns no review when the API reports 404', async () => {
  jest.spyOn(ApiClient, 'get').mockRejectedValue(new ApiError('NOT_FOUND', 'No review', { statusCode: 404 }));

  await expect(ReviewsApi.getOrderReview('order-id')).resolves.toBeNull();
});

it('propagates an API error even when its message says not found', async () => {
  const error = new ApiError('AUTH_ERROR', 'Review not found', { statusCode: 403 });
  jest.spyOn(ApiClient, 'get').mockRejectedValue(error);

  await expect(ReviewsApi.getOrderReview('order-id')).rejects.toBe(error);
});
