import type {
  CreateReviewPayload,
  OrderReview,
  UpdateReviewPayload,
} from '../types/order.types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { ReviewsApi } from '@/services/reviews/reviews-api';
import { ordersQueryKeys } from './orders-query-keys';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export function useOrderReview(orderId?: string | null) {
  const queryClient = useQueryClient();
  const validOrderId = orderId || '';

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
    const elapsed = Date.now() - createdTime;
    return elapsed >= 0 && elapsed <= FORTY_EIGHT_HOURS_MS;
  }, [review]);

  const hoursRemainingToEdit = React.useMemo(() => {
    if (!canEdit || !review?.createdAt) {
      return 0;
    }
    const createdTime = new Date(review.createdAt).getTime();
    const remainingMs = FORTY_EIGHT_HOURS_MS - (Date.now() - createdTime);
    return Math.max(0, Math.ceil(remainingMs / (60 * 60 * 1000)));
  }, [canEdit, review?.createdAt]);

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

