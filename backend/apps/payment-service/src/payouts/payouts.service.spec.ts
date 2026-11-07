import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermanentInboundError } from '../common/inbound/inbound-event.js';
import { MockPayoutProvider } from './mock-payout.provider.js';
import { PayoutsService } from './payouts.service.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const withdrawalId = randomUUID();
const payoutOperationId = randomUUID();
const userId = randomUUID();
const bankAccountId = randomUUID();
const event = { withdrawalId, payoutOperationId, userId, bankAccountId, amount: '200000' };

function payout(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(), withdrawalId, payoutOperationId, userId, bankAccountId, amountVnd: 200000n, status: 'pending',
    bankAccountSnapshot: { state: 'unresolved' }, failureReason: null, processingAt: null, ...overrides,
  };
}

function setup(options: { enabled?: boolean; snapshot?: Record<string, unknown> | null; payoutOutcome?: any } = {}) {
  const attempts: Array<Record<string, any>> = [];
  const tx = {
    payout: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    payoutAttempt: {
      aggregate: vi.fn(async () => ({ _max: { attemptNo: attempts.length || null } })),
      create: vi.fn(async ({ data }) => { const a = { id: randomUUID(), ...data }; attempts.push(a); return a; }),
    },
  };
  const client = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
    payout: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    payoutAttempt: {
      findFirst: vi.fn(async () => attempts[attempts.length - 1] ?? null),
      update: vi.fn(async ({ where, data }) => Object.assign(attempts.find((a) => a.id === where.id)!, data)),
    },
  };
  const wallet = {
    claimWithdrawal: vi.fn().mockResolvedValue({ outcome: 'ok', status: 200, data: {} }),
    finishWithdrawal: vi.fn().mockResolvedValue({ outcome: 'ok', status: 200, data: {} }),
  };
  const provider = {
    name: 'mock', simulated: true, isEnabled: () => options.enabled ?? true,
    send: vi.fn().mockResolvedValue(options.payoutOutcome ?? { outcome: 'succeeded', reference: 'MOCK-1' }),
  };
  const snapshots = { fetch: vi.fn().mockResolvedValue(options.snapshot === undefined ? { bankCode: 'X' } : options.snapshot) };
  const inbox = { register: vi.fn() };
  const service = new PayoutsService({ client } as never, wallet as never, provider as never, snapshots as never, inbox as never);
  return { service, tx, client, wallet, provider, snapshots, attempts };
}

describe('PayoutsService.onWithdrawalRequested', () => {
  it('stores the payout (simulated, unresolved snapshot) before any dispatch', async () => {
    const { service, tx } = setup();
    await service.onWithdrawalRequested(event, tx as never);
    expect(tx.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        withdrawalId, payoutOperationId, amountVnd: 200000n, isSimulated: true, idempotencyKey: `payout:${withdrawalId}`,
        bankAccountSnapshot: { state: 'unresolved' },
      }),
    });
  });

  it('is a no-op for a replay and permanent for a contradicting event', async () => {
    const { service, tx } = setup();
    tx.payout.findUnique.mockResolvedValue(payout());
    await service.onWithdrawalRequested(event, tx as never);
    expect(tx.payout.create).not.toHaveBeenCalled();
    await expect(service.onWithdrawalRequested({ ...event, amount: '1' }, tx as never)).rejects.toBeInstanceOf(PermanentInboundError);
  });

  it('rejects malformed events', async () => {
    const { service, tx } = setup();
    await expect(service.onWithdrawalRequested({ ...event, amount: '0' }, tx as never)).rejects.toBeInstanceOf(PermanentInboundError);
    await expect(service.onWithdrawalRequested({ ...event, withdrawalId: 'x' }, tx as never)).rejects.toBeInstanceOf(PermanentInboundError);
  });
});

describe('PayoutsService.advance', () => {
  it('does nothing when the payout provider is disabled', async () => {
    const { service, wallet, provider } = setup({ enabled: false });
    await service.advance(payout() as never);
    expect(wallet.claimWithdrawal).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('never claims or dispatches without a validated bank snapshot', async () => {
    const { service, wallet, provider } = setup({ snapshot: null });
    await service.advance(payout() as never);
    expect(wallet.claimWithdrawal).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('claims the withdrawal in Wallet before dispatching and then reports success', async () => {
    const { service, wallet, provider, client } = setup();
    const row = payout();
    client.payout.findUnique.mockResolvedValue({ ...row, status: 'processing' });
    await service.advance(row as never);
    const claimOrder = wallet.claimWithdrawal.mock.invocationCallOrder[0];
    const sendOrder = provider.send.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(sendOrder);
    expect(wallet.claimWithdrawal).toHaveBeenCalledWith(withdrawalId, { payoutOperationId, payoutReference: `payout:${row.id}` });
    expect(wallet.finishWithdrawal).toHaveBeenCalledWith(withdrawalId, { payoutOperationId, status: 'succeeded' });
    expect(client.payout.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }));
  });

  it('reports a simulated failure to Wallet so the hold can be released', async () => {
    const { service, wallet, client } = setup({ payoutOutcome: { outcome: 'failed', reason: 'Simulated payout failure' } });
    const row = payout();
    client.payout.findUnique.mockResolvedValue({ ...row, status: 'processing' });
    await service.advance(row as never);
    expect(wallet.finishWithdrawal).toHaveBeenCalledWith(withdrawalId, { payoutOperationId, status: 'failed' });
  });

  it('keeps the hold and goes to review on an unknown provider outcome (no blind retry)', async () => {
    const { service, wallet, client } = setup({ payoutOutcome: { outcome: 'unknown' } });
    await service.advance(payout() as never);
    expect(wallet.finishWithdrawal).not.toHaveBeenCalled();
    expect(client.payout.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'needs_review', failureReason: 'provider_outcome_unknown' }) }));
  });

  it('does not dispatch when the Wallet claim is rejected or unreachable', async () => {
    const rejected = setup();
    rejected.wallet.claimWithdrawal.mockResolvedValue({ outcome: 'rejected', status: 409, message: 'cancelled' });
    await rejected.service.advance(payout() as never);
    expect(rejected.provider.send).not.toHaveBeenCalled();
    expect(rejected.client.payout.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'needs_review' }) }));

    const unknown = setup();
    unknown.wallet.claimWithdrawal.mockResolvedValue({ outcome: 'unknown', message: 'timeout' });
    await unknown.service.advance(payout() as never);
    expect(unknown.provider.send).not.toHaveBeenCalled();
  });
});

describe('MockPayoutProvider', () => {
  it('is disabled by default and in production, and always simulated', async () => {
    const provider = new MockPayoutProvider();
    expect(provider.simulated).toBe(true);
    expect(provider.isEnabled()).toBe(false);
    process.env.PAYOUT_MOCK_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    expect(provider.isEnabled()).toBe(false);
    process.env.NODE_ENV = 'development';
    expect(provider.isEnabled()).toBe(true);
  });

  it('returns simulated outcomes controlled by configuration', async () => {
    const provider = new MockPayoutProvider();
    const request = { payoutId: 'p1', amountVnd: 1n, bankAccountSnapshot: {} };
    await expect(provider.send(request)).resolves.toEqual({ outcome: 'succeeded', reference: 'MOCK-p1' });
    process.env.PAYOUT_MOCK_OUTCOME = 'failed';
    await expect(provider.send(request)).resolves.toMatchObject({ outcome: 'failed' });
    process.env.PAYOUT_MOCK_OUTCOME = 'unknown';
    await expect(provider.send(request)).resolves.toEqual({ outcome: 'unknown' });
  });
});
