export const ordersQueryKeys = {
  all: ['orders'] as const,
  customerRequests: () => [...ordersQueryKeys.all, 'customer', 'requests'] as const,
  customerRequestDetail: (id: string) =>
    [...ordersQueryKeys.all, 'customer', 'requests', id] as const,
  customerOrders: (tab?: string) =>
    [...ordersQueryKeys.all, 'customer', 'orders', tab ?? 'all'] as const,
  orderDetail: (id: string) => [...ordersQueryKeys.all, 'detail', id] as const,
  orderStatusHistory: (id: string) =>
    [...ordersQueryKeys.all, 'detail', id, 'status-history'] as const,
  workerProposals: () => [...ordersQueryKeys.all, 'worker', 'proposals'] as const,
  workerOrders: (tab?: string) =>
    [...ordersQueryKeys.all, 'worker', 'orders', tab ?? 'all'] as const,
};
