import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';
import type { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';

// Run against a migrated PostgreSQL test database with ORDER_TEST_DATABASE_URL set.
describe.skipIf(!process.env.ORDER_TEST_DATABASE_URL)('OrdersService evidence concurrency (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: OrdersService;
  let orderId: string;
  let requestId: string;
  let proposalId: string;
  let originalUrl: string | undefined;
  let originalPoolMax: string | undefined;
  const customerId = randomUUID();
  const workerId = randomUUID();
  const serviceId = randomUUID();

  beforeAll(async () => {
    originalUrl = process.env.DATABASE_URL_ORDER;
    originalPoolMax = process.env.DB_POOL_MAX_ORDER;
    process.env.DATABASE_URL_ORDER = process.env.ORDER_TEST_DATABASE_URL;
    process.env.DB_POOL_MAX_ORDER = '4';
    prisma = new PrismaService();
    await prisma.$connect();
    service = new OrdersService(prisma, {} as OrderOutboxRepository);

    const suffix = randomUUID().slice(0, 8);
    const request = await prisma.serviceRequest.create({
      data: { requestCode: `REQ-INT-${suffix}`, customerUserId: customerId },
    });
    requestId = request.id;
    const proposal = await prisma.bookingProposal.create({
      data: {
        serviceRequestId: requestId,
        customerUserId: customerId,
        workerUserId: workerId,
        selectionSource: 'bid',
        agreedPrice: 100000,
        agreedScope: 'Integration test',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    proposalId = proposal.id;
    const order = await prisma.order.create({
      data: {
        orderCode: `ORD-INT-${suffix}`,
        serviceRequestId: requestId,
        bookingProposalId: proposalId,
        customerUserId: customerId,
        workerUserId: workerId,
        serviceId,
        selectionSource: 'bid',
        agreedPrice: 100000,
        agreedScope: 'Integration test',
        addressText: 'Integration test address',
        latitude: 16.05,
        longitude: 108.2,
        status: 'in_progress',
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (orderId) await prisma.order.delete({ where: { id: orderId } });
      if (proposalId) await prisma.bookingProposal.delete({ where: { id: proposalId } });
      if (requestId) await prisma.serviceRequest.delete({ where: { id: requestId } });
      await prisma.$disconnect();
    }
    if (originalUrl === undefined) delete process.env.DATABASE_URL_ORDER;
    else process.env.DATABASE_URL_ORDER = originalUrl;
    if (originalPoolMax === undefined) delete process.env.DB_POOL_MAX_ORDER;
    else process.env.DB_POOL_MAX_ORDER = originalPoolMax;
  });

  it('stores one evidence for two concurrent requests with the same client ID', async () => {
    const clientEvidenceId = randomUUID();
    const dto = {
      clientEvidenceId,
      mediaType: 'image',
      mediaUrl: `https://example.com/evidence/${clientEvidenceId}.jpg`,
    };

    const [first, second] = await Promise.all([
      service.addEvidence(orderId, workerId, dto),
      service.addEvidence(orderId, workerId, dto),
    ]);

    expect(first.id).toBe(second.id);
    expect(await prisma.orderEvidence.count({ where: { orderId, clientEvidenceId } })).toBe(1);
  });
});
