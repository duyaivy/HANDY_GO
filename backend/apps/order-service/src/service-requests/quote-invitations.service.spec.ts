import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { QuoteInvitationsService } from './quote-invitations.service.js';

const dto = {
  workerUserId: 'worker',
  sourceMatchResultId: 'match',
  note: '  Có kiểm tra tận nơi không?  ',
};
const openRequest = {
  customerUserId: 'customer',
  status: 'open_for_bidding',
  biddingClosesAt: null,
};

function fixture() {
  const saved = { id: 'invite', workerUserId: dto.workerUserId };
  const request = { findUnique: vi.fn().mockResolvedValue(openRequest) };
  const invites = {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(saved),
  };
  const lock = vi.fn();
  const transaction = {
    serviceRequest: request,
    quoteInvitation: invites,
    $executeRaw: lock,
  };
  const prisma = {
    ...transaction,
    $transaction: vi.fn((run) => run(transaction)),
  };
  const verifier = { verifyProposalSource: vi.fn() };
  const outbox = { createEvent: vi.fn() };
  const service = new QuoteInvitationsService(
    prisma as never,
    verifier as never,
    outbox as never,
  );
  return {
    service,
    request,
    invites,
    lock,
    verifier,
    outbox,
    transaction,
    saved,
  };
}

describe('QuoteInvitationsService', () => {
  it('writes a trimmed note and a worker notification in the locked transaction', async () => {
    const { service, invites, lock, verifier, outbox, transaction, saved } =
      fixture();

    await expect(service.create('request', 'customer', dto)).resolves.toBe(
      saved,
    );
    expect(verifier.verifyProposalSource).toHaveBeenCalledWith({
      selectionSource: 'recommendation',
      serviceRequestId: 'request',
      workerUserId: 'worker',
      sourceMatchResultId: 'match',
    });
    expect(lock).toHaveBeenCalledOnce();
    expect(invites.create).toHaveBeenCalledWith({
      data: {
        serviceRequestId: 'request',
        workerUserId: 'worker',
        sourceMatchResultId: 'match',
        note: 'Có kiểm tra tận nơi không?',
      },
    });
    expect(outbox.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'quote_invitation.created',
        payload: {
          invitationId: 'invite',
          requestId: 'request',
          customerId: 'customer',
          workerId: 'worker',
        },
      }),
      transaction,
    );
  });

  it('returns a concurrently created invitation without emitting another event', async () => {
    const { service, invites, outbox, saved } = fixture();
    invites.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(saved);
    await expect(service.create('request', 'customer', dto)).resolves.toBe(
      saved,
    );
    expect(invites.create).not.toHaveBeenCalled();
    expect(outbox.createEvent).not.toHaveBeenCalled();
  });

  it('rejects a non-owner before validating the recommendation', async () => {
    const { service, verifier } = fixture();
    await expect(
      service.create('request', 'someone-else', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(verifier.verifyProposalSource).not.toHaveBeenCalled();
  });

  it('rejects a request that stops accepting bids during verification', async () => {
    const { service, request, invites } = fixture();
    request.findUnique
      .mockResolvedValueOnce(openRequest)
      .mockResolvedValueOnce({
        ...openRequest,
        status: 'bidding_closed',
      });
    await expect(
      service.create('request', 'customer', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invites.create).not.toHaveBeenCalled();
  });

  it('only lists invitations addressed to the caller when they do not own the request', async () => {
    const { service, invites } = fixture();
    await service.list('request', 'worker');
    expect(invites.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serviceRequestId: 'request', workerUserId: 'worker' },
      }),
    );
  });
});
