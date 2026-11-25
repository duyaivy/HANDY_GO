import { describe, it, expect } from 'vitest';
import { reconcileWorkerOrders } from './reconcile-worker-orders.mjs';

function createInMemoryPgClient(initial: {
  profiles: Array<{
    id: string;
    user_id: string;
    completed_order_count: number;
    order_count_total: number;
  }>;
  orders: Array<{
    id: string;
    worker_user_id: string;
    status: string;
    completed_at: Date | null;
    first_completed_at?: Date | null;
    created_at: Date;
  }>;
  contributions?: Array<{
    order_id: string;
    worker_user_id: string;
    has_contributed_total: boolean;
    has_contributed_completed: boolean;
  }>;
  failOnWorkerUserId?: string;
}) {
  const state = {
    profiles: initial.profiles.map((p) => ({ ...p })),
    orders: initial.orders.map((o) => ({
      ...o,
      first_completed_at: o.first_completed_at ?? null,
    })),
    contributions: new Map<
      string,
      {
        order_id: string;
        worker_user_id: string;
        has_contributed_total: boolean;
        has_contributed_completed: boolean;
      }
    >(
      (initial.contributions ?? []).map((c) => [c.order_id, { ...c }]),
    ),
  };

  const client = {
    state,
    query: async (sql: string, params: any[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (
        normalized.startsWith('CREATE TABLE') ||
        normalized === 'BEGIN' ||
        normalized === 'COMMIT' ||
        normalized === 'ROLLBACK'
      ) {
        return { rows: [] };
      }

      if (normalized.includes('LEFT JOIN user_trust_service.worker_profiles wp')) {
        const missing = state.orders
          .filter(
            (o) =>
              o.worker_user_id &&
              !state.profiles.some(
                (p) => p.user_id === o.worker_user_id || p.id === o.worker_user_id,
              ),
          )
          .map((o) => ({ order_id: o.id, worker_user_id: o.worker_user_id }));
        return { rows: missing };
      }

      if (normalized.includes('FROM user_trust_service.worker_profiles ORDER BY')) {
        return {
          rows: state.profiles.map((p) => ({ id: p.id, user_id: p.user_id })),
        };
      }

      if (normalized.includes('FROM user_trust_service.worker_profiles WHERE id = $1 FOR UPDATE')) {
        const found = state.profiles.filter((p) => p.id === params[0]);
        return { rows: found.map((p) => ({ ...p })) };
      }

      if (normalized.includes('FROM order_service.orders')) {
        const [userId, profileId] = params;
        if (initial.failOnWorkerUserId && userId === initial.failOnWorkerUserId) {
          throw new Error(`Simulated DB failure for worker ${userId}`);
        }
        const rows = state.orders
          .filter((o) => o.worker_user_id === userId || o.worker_user_id === profileId)
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
          .map((o) => ({
            order_id: o.id,
            status: o.status,
            completed_at: o.completed_at,
            first_completed_at: o.first_completed_at,
          }));
        return { rows };
      }

      if (normalized.startsWith('INSERT INTO user_trust_service.worker_order_contributions')) {
        const [orderId, workerUserId, isCompleted] = params;
        const existing = state.contributions.get(orderId);
        if (!existing) {
          state.contributions.set(orderId, {
            order_id: orderId,
            worker_user_id: workerUserId,
            has_contributed_total: true,
            has_contributed_completed: Boolean(isCompleted),
          });
        } else {
          existing.has_contributed_total = true;
          existing.has_contributed_completed =
            existing.has_contributed_completed || Boolean(isCompleted);
        }
        return { rows: [] };
      }

      if (normalized.includes('FROM user_trust_service.worker_order_contributions WHERE worker_user_id = $1')) {
        const [workerUserId] = params;
        let totalCount = 0;
        let completedCount = 0;
        for (const c of state.contributions.values()) {
          if (c.worker_user_id === workerUserId) {
            if (c.has_contributed_total) totalCount++;
            if (c.has_contributed_completed) completedCount++;
          }
        }
        return {
          rows: [{ total_count: totalCount, completed_count: completedCount }],
        };
      }

      if (normalized.startsWith('UPDATE user_trust_service.worker_profiles SET completed_order_count = $1')) {
        const [completed, total, id] = params;
        const profile = state.profiles.find((p) => p.id === id);
        if (profile) {
          profile.completed_order_count = completed;
          profile.order_count_total = total;
        }
        return { rows: [] };
      }

      throw new Error(`Unhandled SQL in test mock: ${normalized}`);
    },
  };

  return client;
}

describe('reconcileWorkerOrders', () => {
  it('bootstraps contribution projection without double-counting existing historical counters (20 -> 20, not 40)', async () => {
    const orders = Array.from({ length: 20 }, (_, i) => ({
      id: `order-${i + 1}`,
      worker_user_id: 'worker-user-1',
      status: 'completed',
      completed_at: new Date(2026, 10, 1, 0, i),
      first_completed_at: new Date(2026, 10, 1, 0, i),
      created_at: new Date(2026, 10, 1, 0, i),
    }));

    const client = createInMemoryPgClient({
      profiles: [
        {
          id: 'wp-1',
          user_id: 'worker-user-1',
          completed_order_count: 20,
          order_count_total: 20,
        },
      ],
      orders,
      contributions: [],
    });

    const firstRun = await reconcileWorkerOrders(client);
    expect(firstRun.hasErrors).toBe(false);
    expect(firstRun.syncedOrders).toBe(20);
    expect(firstRun.updatedWorkers).toBe(0);
    expect(client.state.contributions.size).toBe(20);
    expect(client.state.profiles[0].completed_order_count).toBe(20);
    expect(client.state.profiles[0].order_count_total).toBe(20);

    const secondRun = await reconcileWorkerOrders(client);
    expect(secondRun.hasErrors).toBe(false);
    expect(secondRun.updatedWorkers).toBe(0);
    expect(client.state.profiles[0].completed_order_count).toBe(20);
    expect(client.state.profiles[0].order_count_total).toBe(20);
  });

  it('counts warranty/rework orders with completed_at=null and first_completed_at!=null as completed', async () => {
    const client = createInMemoryPgClient({
      profiles: [
        {
          id: 'wp-warranty',
          user_id: 'worker-warranty',
          completed_order_count: 0,
          order_count_total: 0,
        },
      ],
      orders: [
        {
          id: 'order-warranty-1',
          worker_user_id: 'worker-warranty',
          status: 'in_progress', // Rework after dispute
          completed_at: null, // Reset during rework
          first_completed_at: new Date(2026, 10, 5), // Previously completed once
          created_at: new Date(2026, 10, 1),
        },
      ],
    });

    const result = await reconcileWorkerOrders(client);
    expect(result.hasErrors).toBe(false);
    expect(client.state.contributions.get('order-warranty-1')?.has_contributed_completed).toBe(true);
    expect(client.state.profiles[0].completed_order_count).toBe(1);
    expect(client.state.profiles[0].order_count_total).toBe(1);
  });

  it('reconciles accurately alongside live consumer events without losing or double-counting', async () => {
    const orders = Array.from({ length: 20 }, (_, i) => ({
      id: `order-${i + 1}`,
      worker_user_id: 'worker-user-1',
      status: 'completed',
      completed_at: new Date(2026, 10, 1, 0, i),
      first_completed_at: new Date(2026, 10, 1, 0, i),
      created_at: new Date(2026, 10, 1, 0, i),
    }));
    orders.push({
      id: 'order-21',
      worker_user_id: 'worker-user-1',
      status: 'completed',
      completed_at: new Date(2026, 10, 2),
      first_completed_at: new Date(2026, 10, 2),
      created_at: new Date(2026, 10, 2),
    });

    const client = createInMemoryPgClient({
      profiles: [
        {
          id: 'wp-1',
          user_id: 'worker-user-1',
          completed_order_count: 21,
          order_count_total: 21,
        },
      ],
      orders,
      contributions: [
        {
          order_id: 'order-21',
          worker_user_id: 'worker-user-1',
          has_contributed_total: true,
          has_contributed_completed: true,
        },
      ],
    });

    const result = await reconcileWorkerOrders(client);
    expect(result.hasErrors).toBe(false);
    expect(result.syncedOrders).toBe(21);
    expect(client.state.contributions.size).toBe(21);
    expect(client.state.profiles[0].completed_order_count).toBe(21);
    expect(client.state.profiles[0].order_count_total).toBe(21);
  });

  it('reports failedWorkers and skippedOrders with hasErrors=true instead of silently succeeding', async () => {
    const client = createInMemoryPgClient({
      profiles: [
        {
          id: 'wp-fail',
          user_id: 'worker-fail',
          completed_order_count: 0,
          order_count_total: 0,
        },
        {
          id: 'wp-ok',
          user_id: 'worker-ok',
          completed_order_count: 0,
          order_count_total: 0,
        },
      ],
      orders: [
        {
          id: 'order-ok-1',
          worker_user_id: 'worker-ok',
          status: 'completed',
          completed_at: new Date(2026, 10, 1),
          created_at: new Date(2026, 10, 1),
        },
        {
          id: 'order-orphan-1',
          worker_user_id: 'worker-unprovisioned',
          status: 'completed',
          completed_at: new Date(2026, 10, 2),
          created_at: new Date(2026, 10, 2),
        },
      ],
      failOnWorkerUserId: 'worker-fail',
    });

    const result = await reconcileWorkerOrders(client);
    expect(result.hasErrors).toBe(true);
    expect(result.failedWorkers).toEqual([
      expect.objectContaining({
        workerUserId: 'worker-fail',
        profileId: 'wp-fail',
        error: expect.stringContaining('Simulated DB failure'),
      }),
    ]);
    expect(result.skippedOrders).toEqual([
      {
        orderId: 'order-orphan-1',
        workerUserId: 'worker-unprovisioned',
        reason: 'MISSING_WORKER_PROFILE',
      },
    ]);
    // Healthy worker in the same batch was still reconciled
    expect(client.state.profiles.find((p) => p.id === 'wp-ok')?.completed_order_count).toBe(1);
  });
});
