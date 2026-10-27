export const ordersQueryKeys = {
  all: ['orders'] as const,
  customerRequests: (
    tabOrFilter?: string | { tab?: string; status?: string },
    status?: string,
  ) => {
    const tab = typeof tabOrFilter === 'string' ? tabOrFilter : tabOrFilter?.tab ?? 'all';
    const st = typeof tabOrFilter === 'object' ? tabOrFilter.status ?? '' : status ?? '';
    return [...ordersQueryKeys.all, 'customer', 'requests', tab, st] as const;
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
};
