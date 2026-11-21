import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { ReviewsApi } from '@/services/reviews/reviews-api';
import {
  FORTY_EIGHT_HOURS_MS,
  FOURTEEN_DAYS_MS,
  isWithinReviewWindow,
  useOrderReview,
} from '../use-order-review';

jest.mock('@/services/reviews/reviews-api', () => ({
  ReviewsApi: {
    getOrderReview: jest.fn(),
    createReview: jest.fn(),
    updateReview: jest.fn(),
  },
}));

describe('isWithinReviewWindow', () => {
  const baseTime = 1700000000000;

  it('returns false for null or undefined completedAt', () => {
    expect(isWithinReviewWindow(null, baseTime)).toBe(false);
    expect(isWithinReviewWindow(undefined, baseTime)).toBe(false);
  });

  it('returns false for invalid date string', () => {
    expect(isWithinReviewWindow('invalid-date', baseTime)).toBe(false);
  });

  it('returns true when completed within 14 days', () => {
    const completedAt = new Date(baseTime - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinReviewWindow(completedAt, baseTime)).toBe(true);
  });

  it('returns false when completed more than 14 days ago', () => {
    const completedAt = new Date(baseTime - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinReviewWindow(completedAt, baseTime)).toBe(false);
  });

  it('returns true at exactly 14 days boundary', () => {
    const completedAt = new Date(baseTime - FOURTEEN_DAYS_MS).toISOString();
    expect(isWithinReviewWindow(completedAt, baseTime)).toBe(true);
  });

  it('returns false when completed in future beyond 5 minutes', () => {
    const completedAt = new Date(baseTime + 10 * 60 * 1000).toISOString();
    expect(isWithinReviewWindow(completedAt, baseTime)).toBe(false);
  });
});

describe('useOrderReview', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('returns review data and calculates canEdit = true within 48h', async () => {
    const now = Date.now();
    const mockReview = {
      id: 'rev-1',
      orderId: 'order-1',
      rating: 5,
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      isEdited: false,
    };
    (ReviewsApi.getOrderReview as jest.Mock).mockResolvedValueOnce(mockReview);

    const { result } = renderHook(() => useOrderReview('order-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.review).toEqual(mockReview);
    });

    expect(result.current.canEdit).toBe(true);
    expect(result.current.hoursRemainingToEdit).toBe(46);
  });

  it('calculates canEdit = false when review was already edited', async () => {
    const now = Date.now();
    const mockReview = {
      id: 'rev-1',
      orderId: 'order-1',
      rating: 5,
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      isEdited: true,
    };
    (ReviewsApi.getOrderReview as jest.Mock).mockResolvedValueOnce(mockReview);

    const { result } = renderHook(() => useOrderReview('order-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.review).toEqual(mockReview);
    });

    expect(result.current.canEdit).toBe(false);
    expect(result.current.hoursRemainingToEdit).toBe(0);
  });

  it('calculates canEdit = false when review is older than 48h', async () => {
    const now = Date.now();
    const mockReview = {
      id: 'rev-1',
      orderId: 'order-1',
      rating: 5,
      createdAt: new Date(now - (FORTY_EIGHT_HOURS_MS + 1000)).toISOString(),
      isEdited: false,
    };
    (ReviewsApi.getOrderReview as jest.Mock).mockResolvedValueOnce(mockReview);

    const { result } = renderHook(() => useOrderReview('order-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.review).toEqual(mockReview);
    });

    expect(result.current.canEdit).toBe(false);
    expect(result.current.hoursRemainingToEdit).toBe(0);
  });

  it('throws error on updateReview if 48 hours have passed at submit time', async () => {
    const oldCreated = new Date(Date.now() - (FORTY_EIGHT_HOURS_MS + 10_000)).toISOString();
    const mockReview = {
      id: 'rev-1',
      orderId: 'order-1',
      rating: 5,
      createdAt: oldCreated,
      isEdited: false,
    };
    (ReviewsApi.getOrderReview as jest.Mock).mockResolvedValueOnce(mockReview);

    const { result } = renderHook(() => useOrderReview('order-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.review).toEqual(mockReview);
    });

    await expect(
      result.current.updateReview({
        reviewId: 'rev-1',
        payload: { rating: 4 },
      }),
    ).rejects.toThrow('Đã quá thời hạn 48 giờ để chỉnh sửa đánh giá.');
  });

  it('throws error on updateReview if review is already edited at submit time', async () => {
    const mockReview = {
      id: 'rev-1',
      orderId: 'order-1',
      rating: 5,
      createdAt: new Date().toISOString(),
      isEdited: true,
    };
    (ReviewsApi.getOrderReview as jest.Mock).mockResolvedValueOnce(mockReview);

    const { result } = renderHook(() => useOrderReview('order-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.review).toEqual(mockReview);
    });

    await expect(
      result.current.updateReview({
        reviewId: 'rev-1',
        payload: { rating: 4 },
      }),
    ).rejects.toThrow('Đánh giá chỉ được phép chỉnh sửa 1 lần duy nhất.');
  });
});
