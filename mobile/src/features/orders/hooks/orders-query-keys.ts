import type { QueryClient } from '@tanstack/react-query';

export const ordersQueryKeys = {
  all: ['orders'] as const,
  customerRequests: (
    tabOrFilter?: string | { tab?: string; status?: string; search?: string },
    status?: string,
    search?: string,
  ) => {
    const tab = typeof tabOrFilter === 'string' ? tabOrFilter : tabOrFilter?.tab ?? 'all';
    const st = typeof tabOrFilter === 'object' ? tabOrFilter.status ?? '' : status ?? '';
    const srch = typeof tabOrFilter === 'object' ? tabOrFilter.search ?? '' : search ?? '';
    return [...ordersQueryKeys.all, 'customer', 'requests', tab, st, srch] as const;
  },
  customerRequestDetail: (id: string) =>
    [...ordersQueryKeys.all, 'customer', 'requests', id] as const,
  customerOrders: (
    tabOrFilter?: string | { tab?: string; status?: string },
    status?: string,
  ) => {
    const tab = typeof tabOrFilter === 'string' ? tabOrFilter : tabOrFilter?.tab ?? 'all';
    const st = typeof tabOrFilter === 'object' ? tabOrFilter.status ?? '' : status ?? '';
    return [...ordersQueryKeys.all, 'customer', 'orders', tab, st] as const;
  },
  orderDetail: (id: string) => [...ordersQueryKeys.all, 'detail', id] as const,
  orderReview: (id: string) => [...ordersQueryKeys.all, 'detail', id, 'review'] as const,
  orderStatusHistory: (id: string) =>
    [...ordersQueryKeys.all, 'detail', id, 'status-history'] as const,
  workerProposals: (filter?: string | { status?: string }) => {
    const st = typeof filter === 'string' ? filter : filter?.status ?? '';
    return [...ordersQueryKeys.all, 'worker', 'proposals', st] as const;
  },
  workerOrders: (
    tabOrFilter?: string | { tab?: string; status?: string },
    status?: string,
  ) => {
    const tab = typeof tabOrFilter === 'string' ? tabOrFilter : tabOrFilter?.tab ?? 'all';
    const st = typeof tabOrFilter === 'object' ? tabOrFilter.status ?? '' : status ?? '';
    return [...ordersQueryKeys.all, 'worker', 'orders', tab, st] as const;
  },
  orderSummary: (params?: { role?: string }) =>
    [...ordersQueryKeys.all, 'summary', params?.role ?? 'all'] as const,
  customerHistory: (params?: { tab?: string; status?: string; search?: string }) =>
    [
      ...ordersQueryKeys.all,
      'customer',
      'history',
      params?.tab ?? 'all',
      params?.status ?? '',
      params?.search ?? '',
    ] as const,
  workerHistory: (params?: { tab?: string; status?: string; search?: string }) =>
    [
      ...ordersQueryKeys.all,
      'worker',
      'history',
      params?.tab ?? 'all',
      params?.status ?? '',
      params?.search ?? '',
    ] as const,
  workerSkillsOrders: (userId?: string | null) =>
    ['worker-skills-orders', userId] as const,
};

/**
 * Invalidate all queries related to order statistics, worker profiles, and earnings.
 * Ensures all UI surfaces across customer and worker apps reflect updated order counts.
 */
export function invalidateOrderRelatedQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['user-profile'] });
  void queryClient.invalidateQueries({ queryKey: ['worker-public-profile'] });
  void queryClient.invalidateQueries({ queryKey: ['worker-public-profile-services'] });
  void queryClient.invalidateQueries({ queryKey: ['worker-skills-orders'] });
  void queryClient.invalidateQueries({ queryKey: ['worker-my-service-registrations'] });
  void queryClient.invalidateQueries({ queryKey: ['order-worker-profile'] });
  void queryClient.invalidateQueries({ queryKey: ['candidates'] });
  void queryClient.invalidateQueries({ queryKey: ['worker-bidding'] });
  void queryClient.invalidateQueries({ queryKey: ['wallet'] });
  void queryClient.invalidateQueries({ queryKey: ['worker-reviews'] });
}

const pendingInvalidationTimers = new WeakMap<QueryClient, ReturnType<typeof setTimeout>[]>();
const INVALIDATION_RETRY_DELAYS_MS = [1000, 2500, 5000] as const;

/**
 * Immediately invalidates order-related queries and schedules staggered retries
 * at the QueryClient level so unmounting a screen (e.g. tracking) or slow async
 * projection commits (> 1.2s) do not leave stale counters.
 */
export function scheduleOrderRelatedInvalidation(queryClient: QueryClient): void {
  invalidateOrderRelatedQueries(queryClient);

  const existing = pendingInvalidationTimers.get(queryClient);
  if (existing) {
    for (const timer of existing) {
      clearTimeout(timer);
    }
  }

  const timers = INVALIDATION_RETRY_DELAYS_MS.map((delay) => {
    const timer = setTimeout(() => {
      invalidateOrderRelatedQueries(queryClient);
    }, delay);
    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
    return timer;
  });

  pendingInvalidationTimers.set(queryClient, timers);
}
