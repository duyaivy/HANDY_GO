import { OrderStatus } from '@prisma/order-client';

type StatusGroup = 'completed' | 'processing' | 'cancelled' | 'disputed';

const STATUS_GROUP: Record<OrderStatus, StatusGroup> = {
  [OrderStatus.created]: 'processing',
  [OrderStatus.confirmed]: 'processing',
  [OrderStatus.in_progress]: 'processing',
  [OrderStatus.awaiting_customer_confirmation]: 'processing',
  [OrderStatus.completed]: 'completed',
  [OrderStatus.cancelled]: 'cancelled',
  [OrderStatus.disputed]: 'disputed',
};

export interface OrderStatusRow {
  status: OrderStatus;
  _count: { id: number };
}

export function buildOrderStatus(rows: OrderStatusRow[]) {
  const counts: Record<StatusGroup, number> = {
    completed: 0,
    processing: 0,
    cancelled: 0,
    disputed: 0,
  };

  for (const row of rows) {
    counts[STATUS_GROUP[row.status]] += row._count.id;
  }
  const totalOrders = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const percentage = (count: number) =>
    totalOrders === 0 ? 0 : Math.round((count / totalOrders) * 1000) / 10;

  return {
    totalOrders,
    groups: {
      completed: {
        count: counts.completed,
        percentage: percentage(counts.completed),
      },
      processing: {
        count: counts.processing,
        percentage: percentage(counts.processing),
      },
      cancelled: {
        count: counts.cancelled,
        percentage: percentage(counts.cancelled),
      },
      disputed: {
        count: counts.disputed,
        percentage: percentage(counts.disputed),
      },
    },
    performance: {
      completionRate: percentage(counts.completed),
      cancellationRate: percentage(counts.cancelled),
    },
  };
}
