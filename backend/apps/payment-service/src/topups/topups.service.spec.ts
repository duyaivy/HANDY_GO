import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PermanentInboundError } from '../common/inbound/inbound-event.js';
import { IPN_RESPONSE, TopupsService } from './topups.service.js';
import type { ProviderNotification } from './providers/topup-provider.js';

const userId = randomUUID();
const topupId = randomUUID();

function notification(overrides: Partial<ProviderNotification> = {}): ProviderNotification {
  return {
    signatureValid: true, txnRef: 'HGREF', amountVnd: 50000n, success: true, responseCode: '00',
    providerTransactionNo: '777', eventKey: 'HGREF:777:00', auditPayload: { vnp_TxnRef: 'HGREF' }, ...overrides,
  };
}

function setup(topup: Record<string, unknown> | null = null, configured = true) {
  const state = { topup: topup ? { id: topupId, userId, provider: 'vnpay', amountVnd: 50000n, pointsToCredit: 50000n, idempotencyKey: 'key-12345', status: 'awaiting_payment', providerPaidAt: null, ...topup } : null } as { topup: Record<string, any> | null };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    providerNotification: { createMany: vi.fn().mockResolvedValue({ count: 1 }), updateMany: vi.fn() },
    topupRequest: {
      findUniqueOrThrow: vi.fn(async () => state.topup),
      findUnique: vi.fn(async () => state.topup),
      update: vi.fn(async ({ data }) => Object.assign(state.topup!, data)),
      updateMany: vi.fn(async ({ data }) => { Object.assign(state.topup!, data); return { count: 1 }; }),
    },
    topupAttempt: { updateMany: vi.fn() },
  };
  const client = {
    $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
    topupRequest: { findUnique: vi.fn(async () => state.topup), create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    providerNotification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const provider = {
    name: 'vnpay', isConfigured: () => configured, buildCheckoutUrl: vi.fn(() => 'https://pay.example/checkout'),
    verifyNotification: vi.fn(() => notification()),
  };
  const outbox = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const inbox = { register: vi.fn() };
  const service = new TopupsService({ client } as never, provider as never, outbox as never, inbox as never);
  return { service, state, tx, client, provider, outbox, inbox };
}

describe('TopupsService.create', () => {
  it('fails closed with 503 while the provider is not configured', async () => {
    const { service, client } = setup(null, false);
    await expect(service.create(userId, { amountVnd: 50000, idempotencyKey: 'key-12345' }, '127.0.0.1')).rejects.toMatchObject({ status: 503 });
    expect(client.topupRequest.create).not.toHaveBeenCalled();
  });

  it('creates an awaiting_payment top-up where 1 VND credits 1 Point', async () => {
    const { service, client, provider } = setup(null);
    client.topupRequest.findUnique.mockResolvedValue(null);
    client.topupRequest.create.mockImplementation(async ({ data }: any) => ({ id: topupId, ...data, providerPaidAt: null, walletCreditedAt: null, createdAt: new Date() }));
    const result = await service.create(userId, { amountVnd: 50000, idempotencyKey: 'key-12345' }, '10.0.0.1');
    expect(client.topupRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId, amountVnd: 50000n, pointsToCredit: 50000n, status: 'awaiting_payment', provider: 'vnpay' }),
    }));
    expect(provider.buildCheckoutUrl).toHaveBeenCalledWith(expect.objectContaining({ amountVnd: 50000n, ipAddress: '10.0.0.1' }));
    expect(result).toMatchObject({ amountVnd: '50000', pointsToCredit: '50000', checkoutUrl: 'https://pay.example/checkout' });
  });

  it('replays the same top-up for the same key and rejects a different payload', async () => {
    const { service, client } = setup({ checkoutUrl: 'https://pay.example/x', createdAt: new Date() });
    await expect(service.create(userId, { amountVnd: 50000, idempotencyKey: 'key-12345' }, '127.0.0.1')).resolves.toMatchObject({ id: topupId });
    await expect(service.create(userId, { amountVnd: 60000, idempotencyKey: 'key-12345' }, '127.0.0.1')).rejects.toMatchObject({ status: 409 });
    await expect(service.create(randomUUID(), { amountVnd: 50000, idempotencyKey: 'key-12345' }, '127.0.0.1')).rejects.toMatchObject({ status: 409 });
    expect(client.topupRequest.create).not.toHaveBeenCalled();
  });
});

describe('TopupsService.handleIpn', () => {
  it('rejects invalid signatures without touching the database', async () => {
    const { service, provider, client } = setup({});
    provider.verifyNotification.mockReturnValue(notification({ signatureValid: false }));
    await expect(service.handleIpn({})).resolves.toBe(IPN_RESPONSE.invalidSignature);
    expect(client.topupRequest.findUnique).not.toHaveBeenCalled();
  });

  it('answers 01 for unknown references and 04 for a mismatching amount', async () => {
    const unknown = setup(null);
    await expect(unknown.service.handleIpn({})).resolves.toBe(IPN_RESPONSE.notFound);

    const mismatch = setup({});
    mismatch.provider.verifyNotification.mockReturnValue(notification({ amountVnd: 1n }));
    await expect(mismatch.service.handleIpn({})).resolves.toBe(IPN_RESPONSE.invalidAmount);
    expect(mismatch.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('moves to credit_pending and emits payment.topup.succeeded only after a verified success', async () => {
    const { service, state, outbox, tx } = setup({});
    await expect(service.handleIpn({})).resolves.toBe(IPN_RESPONSE.ok);
    expect(state.topup!.status).toBe('credit_pending');
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: 'payment.topup.succeeded' }));
  });

  it('does not emit again for duplicate or already confirmed notifications', async () => {
    const duplicate = setup({});
    duplicate.tx.providerNotification.createMany.mockResolvedValue({ count: 0 });
    await expect(duplicate.service.handleIpn({})).resolves.toBe(IPN_RESPONSE.alreadyConfirmed);
    expect(duplicate.outbox.enqueue).not.toHaveBeenCalled();

    const confirmed = setup({ status: 'credit_pending' });
    await expect(confirmed.service.handleIpn({})).resolves.toBe(IPN_RESPONSE.alreadyConfirmed);
    expect(confirmed.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('marks provider failures as failed and never emits a credit', async () => {
    const { service, state, provider, outbox } = setup({});
    provider.verifyNotification.mockReturnValue(notification({ success: false, responseCode: '24' }));
    await expect(service.handleIpn({})).resolves.toBe(IPN_RESPONSE.ok);
    expect(state.topup!.status).toBe('failed');
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('still honours a verified payment that arrives after the checkout expired', async () => {
    const { service, state } = setup({ status: 'expired' });
    await service.handleIpn({});
    expect(state.topup!.status).toBe('credit_pending');
  });
});

describe('TopupsService.onWalletCredited', () => {
  const credited = { paymentId: topupId, userId, amount: '50000' };

  it('completes only after the Wallet ACK for a provider-verified top-up', async () => {
    const { service, state, tx } = setup({ status: 'credit_pending', providerPaidAt: new Date() });
    await service.onWalletCredited(credited, tx as never);
    expect(state.topup!.status).toBe('completed');
    expect(state.topup!.walletCreditedAt).toBeInstanceOf(Date);
  });

  it('sends a credit without provider evidence to review instead of completing it', async () => {
    const { service, state, tx } = setup({ status: 'awaiting_payment' });
    await service.onWalletCredited(credited, tx as never);
    expect(state.topup!.status).toBe('needs_review');
  });

  it('rejects contradicting or unknown credits as permanent and ignores replays', async () => {
    const { service, tx } = setup({ status: 'credit_pending', providerPaidAt: new Date() });
    await expect(service.onWalletCredited({ ...credited, amount: '1' }, tx as never)).rejects.toBeInstanceOf(PermanentInboundError);
    await expect(service.onWalletCredited({ ...credited, userId: randomUUID() }, tx as never)).rejects.toBeInstanceOf(PermanentInboundError);

    const completed = setup({ status: 'completed' });
    await completed.service.onWalletCredited(credited, completed.tx as never);
    expect(completed.tx.topupRequest.updateMany).not.toHaveBeenCalled();

    const missing = setup(null);
    await expect(missing.service.onWalletCredited(credited, missing.tx as never)).rejects.toBeInstanceOf(PermanentInboundError);
  });
});

describe('TopupsService.reconcile', () => {
  it('expires unpaid checkouts and flags credits Wallet never acknowledged', async () => {
    const { service, client } = setup({});
    await expect(service.reconcile()).resolves.toEqual({ expired: 2, flagged: 2 });
    expect(client.topupRequest.updateMany).toHaveBeenCalledTimes(2);
  });
});
