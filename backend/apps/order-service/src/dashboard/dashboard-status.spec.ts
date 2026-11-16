import { OrderStatus } from '@prisma/order-client';
import { describe, expect, it } from 'vitest';
import { buildOrderStatus } from './dashboard-status.js';

describe('dashboard order status', () => {
  it('maps every current OrderStatus into exactly one of four groups', () => {
    const result = buildOrderStatus([
      { status: OrderStatus.created, _count: { id: 1 } },
      { status: OrderStatus.confirmed, _count: { id: 2 } },
      { status: OrderStatus.in_progress, _count: { id: 3 } },
      { status: OrderStatus.awaiting_customer_confirmation, _count: { id: 4 } },
      { status: OrderStatus.completed, _count: { id: 6 } },
      { status: OrderStatus.cancelled, _count: { id: 2 } },
      { status: OrderStatus.disputed, _count: { id: 2 } },
    ]);
    expect(result.totalOrders).toBe(20);
    expect(result.groups).toEqual({
      completed: { count: 6, percentage: 30 },
      processing: { count: 10, percentage: 50 },
      cancelled: { count: 2, percentage: 10 },
      disputed: { count: 2, percentage: 10 },
    });
    expect(result.performance).toEqual({
      completionRate: 30,
      cancellationRate: 10,
    });
  });

  it('uses the created-order total as denominator and rounds to one decimal', () => {
    const result = buildOrderStatus([
      { status: OrderStatus.completed, _count: { id: 1 } },
      { status: OrderStatus.cancelled, _count: { id: 1 } },
      { status: OrderStatus.disputed, _count: { id: 1 } },
    ]);
    expect(result.performance).toEqual({
      completionRate: 33.3,
      cancellationRate: 33.3,
    });
    expect(result.groups.disputed.percentage).toBe(33.3);
    expect(
      Object.values(result.groups).reduce((sum, group) => sum + group.count, 0),
    ).toBe(result.totalOrders);
  });

  it('returns four zero groups and zero rates when there are no orders', () => {
    expect(buildOrderStatus([])).toEqual({
      totalOrders: 0,
      groups: {
        completed: { count: 0, percentage: 0 },
        processing: { count: 0, percentage: 0 },
        cancelled: { count: 0, percentage: 0 },
        disputed: { count: 0, percentage: 0 },
      },
      performance: { completionRate: 0, cancellationRate: 0 },
    });
  });
});
