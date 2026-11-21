import type {
  CreateReviewPayload,
  OrderReview,
  UpdateReviewPayload,
} from '../types/order.types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { ReviewsApi } from '@/services/reviews/reviews-api';
import { ordersQueryKeys } from './orders-query-keys';

export const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function isWithinReviewWindow(
  completedAt?: string | null,
  now: number = Date.now(),
): boolean {
  if (!completedAt) {
    return false;
  }
  const completedTime = new Date(completedAt).getTime();
  if (Number.isNaN(completedTime)) {
    return false;
  }
  const diffMs = now - completedTime;
  // Cho phép sai số đồng hồ tối đa 5 phút trong tương lai, và tối đa 14 ngày
  return diffMs >= -5 * 60 * 1000 && diffMs <= FOURTEEN_DAYS_MS;
}

export function useOrderReview(orderId?: string | null) {
  const queryClient = useQueryClient();
  const validOrderId = orderId || '';

  const [currentTime, setCurrentTime] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const reviewQuery = useQuery<OrderReview | null>({
    queryKey: ordersQueryKeys.orderReview(validOrderId),
    queryFn: async () => {
      if (!validOrderId || validOrderId.startsWith('demo-')) {
        return null;
      }
      return ReviewsApi.getOrderReview(validOrderId);
    },
    enabled: Boolean(validOrderId),
    staleTime: 60 * 1000,
  });

  const createReviewMutation = useMutation({
    mutationFn: async (payload: CreateReviewPayload) => {
      return ReviewsApi.createReview(payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(ordersQueryKeys.orderReview(validOrderId), data);
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.orderReview(validOrderId) });
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.orderDetail(validOrderId) });
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.customerOrders() });
    },
  });

  const updateReviewMutation = useMutation({
    mutationFn: async ({
      reviewId,
      payload,
    }: {
      reviewId: string;
      payload: UpdateReviewPayload;
    }) => {
      const currentReview
        = queryClient.getQueryData<OrderReview>(ordersQueryKeys.orderReview(validOrderId))
          || reviewQuery.data;

      if (currentReview?.createdAt) {
        const createdTime = new Date(currentReview.createdAt).getTime();
        if (!Number.isNaN(createdTime) && (Date.now() - createdTime > FORTY_EIGHT_HOURS_MS)) {
          throw new Error('Đã quá thời hạn 48 giờ để chỉnh sửa đánh giá.');
        }
      }
      if (currentReview?.isEdited) {
        throw new Error('Đánh giá chỉ được phép chỉnh sửa 1 lần duy nhất.');
      }

      return ReviewsApi.updateReview(reviewId, payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(ordersQueryKeys.orderReview(validOrderId), data);
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.orderReview(validOrderId) });
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.orderDetail(validOrderId) });
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.customerOrders() });
    },
  });

  const review = reviewQuery.data;

  // Tính toán quyền chỉnh sửa đánh giá (trong 48h và chưa từng sửa trước đó)
  const canEdit = React.useMemo(() => {
    if (!review || review.isEdited) {
      return false;
    }
    if (!review.createdAt) {
      return false;
    }
    const createdTime = new Date(review.createdAt).getTime();
    if (Number.isNaN(createdTime)) {
      return false;
    }
    const elapsed = currentTime - createdTime;
    return elapsed >= -60_000 && elapsed <= FORTY_EIGHT_HOURS_MS;
  }, [review, currentTime]);

  const hoursRemainingToEdit = React.useMemo(() => {
    if (!canEdit || !review?.createdAt) {
      return 0;
    }
    const createdTime = new Date(review.createdAt).getTime();
    const remainingMs = FORTY_EIGHT_HOURS_MS - Math.max(0, currentTime - createdTime);
    return Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));
  }, [canEdit, review, currentTime]);

  return {
    review,
    hasReviewed: Boolean(review),
    canEdit,
    hoursRemainingToEdit,
    isLoading: reviewQuery.isLoading,
    isRefetching: reviewQuery.isRefetching,
    isError: reviewQuery.isError,
    error: reviewQuery.error,
    refetch: reviewQuery.refetch,

    // Mutation helpers
    createReview: createReviewMutation.mutateAsync,
    isCreating: createReviewMutation.isPending,
    createError: createReviewMutation.error,

    updateReview: updateReviewMutation.mutateAsync,
    isUpdating: updateReviewMutation.isPending,
    updateError: updateReviewMutation.error,
  };
}
