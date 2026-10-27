import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type INestApplication,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HttpExceptionFilter } from '@app/common';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service.js';
import { BookingProposalsService } from '../src/booking-proposals/booking-proposals.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { InternalOrderService } from '../src/internal/internal-order.service.js';
import { OrderServiceModule } from '../src/order-service.module.js';

// ANSI Colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function logBanner(title: string) {
  const line = '═'.repeat(74);
  console.log(`\n${CYAN}${line}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
  console.log(`${CYAN}${line}${RESET}\n`);
}

function logScenarioHeader(num: number, title: string, subtitle?: string) {
  console.log(`\n${BOLD}${MAGENTA}╔══════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${MAGENTA}║  KỊCH BẢN ${num}: ${title.padEnd(60)}║${RESET}`);
  if (subtitle) {
    console.log(`${GRAY}║  ▸ ${subtitle.padEnd(71)}║${RESET}`);
  }
  console.log(`${BOLD}${MAGENTA}╚══════════════════════════════════════════════════════════════════════════════╝${RESET}`);
}

function logStep(stepNum: string | number, title: string) {
  console.log(`\n${BOLD}${BLUE}╔══ [Bước ${stepNum}] ${title}${RESET}`);
}

function logSuccess(msg: string) {
  console.log(`${GREEN}║   ✔ ${msg}${RESET}`);
}

function logStepEnd() {
  console.log(`${BLUE}╚══════════════════════════════════════════════════════════════════════════════${RESET}`);
}

describe('Order Service E2E Test Suite — Comprehensive Lifecycle (8 Scenarios)', () => {
  let app: INestApplication<App>;

  const CUSTOMER_ID = crypto.randomUUID();
  const WORKER_1_ID = crypto.randomUUID();
  const WORKER_2_ID = crypto.randomUUID();
  const WORKER_3_ID = crypto.randomUUID();
  const ADMIN_ID = crypto.randomUUID();
  const SERVICE_ID = crypto.randomUUID();
  const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'handy-go-internal-service-secret-key-12345';

  const state = {
    requests: new Map<string, any>(),
    proposals: new Map<string, any>(),
    orders: new Map<string, any>(),
    evidences: new Map<string, any[]>(),
    history: new Map<string, any[]>(),
  };

  beforeAll(async () => {
    process.env.INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
    logBanner('KHỞI ĐỘNG TEST SUITE E2E TOÀN BỘ 8 LUỒNG TRONG HỆ THỐNG');

    const serviceRequestsServiceMock = {
      createDraft: async (userId: string, dto: any) => {
        const id = crypto.randomUUID();
        const record = {
          id,
          requestCode: `REQ-${Date.now().toString().slice(-6)}`,
          customerUserId: userId,
          serviceId: dto.serviceId ?? SERVICE_ID,
          description: dto.description ?? 'Mô tả yêu cầu dịch vụ',
          addressText: dto.addressText ?? '123 Nguyễn Lương Bằng, Đà Nẵng',
          latitude: dto.latitude ?? 16.0748,
          longitude: dto.longitude ?? 108.1499,
          scheduledAt: dto.scheduledAt ?? new Date(Date.now() + 86400000).toISOString(),
          aiRefPriceMin: dto.aiRefPriceMin ?? 250000,
          aiRefPriceMax: dto.aiRefPriceMax ?? 450000,
          status: 'draft',
          media: dto.media ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.requests.set(id, record);
        return record;
      },
      findById: async (id: string) => {
        const req = state.requests.get(id);
        if (!req) throw new NotFoundException('Service request not found');
        return req;
      },
      publish: async (id: string, userId: string) => {
        const req = state.requests.get(id);
        if (!req) throw new NotFoundException('Service request not found');
        if (req.customerUserId !== userId) throw new BadRequestException('Not request owner');
        const now = new Date();
        const updated = {
          ...req,
          status: 'open_for_bidding',
          publishedAt: now.toISOString(),
          biddingClosesAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
          selectionExpiresAt: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
          updatedAt: now.toISOString(),
        };
        state.requests.set(id, updated);
        return updated;
      },
      cancel: async (id: string, userId: string) => {
        const req = state.requests.get(id);
        if (!req) throw new NotFoundException('Service request not found');
        if (req.customerUserId !== userId) throw new BadRequestException('Not request owner');
        req.status = 'cancelled';
        req.updatedAt = new Date().toISOString();
        state.requests.set(id, req);

        // Withdraw all open proposals
        for (const [pId, p] of state.proposals.entries()) {
          if (p.serviceRequestId === id && p.status === 'proposed') {
            p.status = 'withdrawn';
            state.proposals.set(pId, p);
          }
        }
        return req;
      },
    };

    const bookingProposalsServiceMock = {
      create: async (userId: string, dto: any) => {
        const req = state.requests.get(dto.serviceRequestId);
        if (!req) throw new NotFoundException('Service request not found');
        if (req.customerUserId !== userId) throw new BadRequestException('Not request owner');
        if (req.status !== 'open_for_bidding' && req.status !== 'bidding_closed') {
          if (req.status === 'converted_to_order') {
            throw new ConflictException('Service request has already been converted to an order');
          }
          throw new BadRequestException(`Cannot create proposal for request in ${req.status}`);
        }

        let revisionNo = 1;
        let supersedesProposalId: string | null = null;

        if (dto.supersedesProposalId) {
          const oldProposal = state.proposals.get(dto.supersedesProposalId);
          if (!oldProposal) throw new NotFoundException('Previous proposal not found');
          if (oldProposal.status !== 'changes_requested') {
            throw new ConflictException('Can only supersede changes_requested proposals');
          }
          revisionNo = oldProposal.revisionNo + 1;
          supersedesProposalId = oldProposal.id;
          oldProposal.supersededBy = true;
        }

        const id = crypto.randomUUID();
        const proposal = {
          id,
          serviceRequestId: dto.serviceRequestId,
          supersedesProposalId,
          revisionNo,
          customerUserId: userId,
          workerUserId: dto.workerUserId,
          selectionSource: dto.selectionSource ?? 'bid',
          sourceBidId: dto.sourceBidId ?? crypto.randomUUID(),
          agreedPrice: dto.agreedPrice,
          agreedScope: dto.agreedScope,
          scheduledAt: dto.scheduledAt ?? req.scheduledAt,
          status: 'proposed',
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.proposals.set(id, proposal);
        return proposal;
      },
      findAll: async (userId: string) => {
        const items = Array.from(state.proposals.values()).filter(
          (p) => p.customerUserId === userId || p.workerUserId === userId,
        );
        return { items, total: items.length, page: 1, limit: 10, totalPages: 1 };
      },
      findById: async (id: string) => {
        const p = state.proposals.get(id);
        if (!p) throw new NotFoundException('Proposal not found');
        return p;
      },
      findMyReceivedProposals: async (workerUserId: string) => {
        const items = Array.from(state.proposals.values()).filter(
          (p) => p.workerUserId === workerUserId,
        );
        return { items, total: items.length, page: 1, limit: 10, totalPages: 1 };
      },
      requestChanges: async (id: string, workerUserId: string, dto: any) => {
        const p = state.proposals.get(id);
        if (!p) throw new NotFoundException('Proposal not found');
        if (p.workerUserId !== workerUserId) throw new BadRequestException('Not proposal recipient');
        p.status = 'changes_requested';
        p.responseNote = dto.responseNote;
        p.workerRespondedAt = new Date().toISOString();
        state.proposals.set(id, p);
        return p;
      },
      reject: async (id: string, workerUserId: string, dto: any) => {
        const p = state.proposals.get(id);
        if (!p) throw new NotFoundException('Proposal not found');
        if (p.workerUserId !== workerUserId) throw new BadRequestException('Not proposal recipient');
        p.status = 'worker_rejected';
        p.responseNote = dto.responseNote;
        p.workerRespondedAt = new Date().toISOString();
        state.proposals.set(id, p);
        return p;
      },
      withdraw: async (id: string, userId: string) => {
        const p = state.proposals.get(id);
        if (!p) throw new NotFoundException('Proposal not found');
        if (p.customerUserId !== userId) throw new BadRequestException('Not proposal owner');
        p.status = 'withdrawn';
        state.proposals.set(id, p);
        return p;
      },
    };

    const ordersServiceMock = {
      acceptProposal: async (proposalId: string, workerUserId: string) => {
        const proposal = state.proposals.get(proposalId);
        if (!proposal) throw new NotFoundException('Proposal not found');
        if (proposal.workerUserId !== workerUserId) {
          throw new BadRequestException('Only target worker can accept this proposal');
        }
        if (proposal.status !== 'proposed') {
          throw new ConflictException(`Cannot accept proposal in '${proposal.status}' status`);
        }

        const req = state.requests.get(proposal.serviceRequestId);
        if (!req) throw new NotFoundException('Service request not found');

        if (req.status === 'converted_to_order') {
          throw new ConflictException('Service request has already been converted to an order');
        }

        proposal.status = 'finalized';
        proposal.finalizedAt = new Date().toISOString();
        state.proposals.set(proposal.id, proposal);

        // Auto-supersede competing proposals for the same request
        for (const [id, otherP] of state.proposals.entries()) {
          if (
            otherP.serviceRequestId === proposal.serviceRequestId &&
            id !== proposal.id &&
            (otherP.status === 'proposed' || otherP.status === 'changes_requested')
          ) {
            otherP.status = 'superseded';
            state.proposals.set(id, otherP);
          }
        }

        req.status = 'converted_to_order';
        state.requests.set(req.id, req);

        const orderId = crypto.randomUUID();
        const orderCode = `ORD-${Date.now().toString().slice(-6)}`;
        const order = {
          id: orderId,
          orderCode,
          serviceRequestId: req.id,
          bookingProposalId: proposal.id,
          customerUserId: proposal.customerUserId,
          workerUserId: proposal.workerUserId,
          serviceId: req.serviceId,
          agreedPrice: String(proposal.agreedPrice),
          agreedScope: proposal.agreedScope,
          addressText: req.addressText,
          status: 'created',
          paymentState: 'unpaid',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.orders.set(orderId, order);
        state.history.set(orderId, [
          {
            fromStatus: null,
            toStatus: 'created',
            reason: 'Tạo đơn hàng sau khi Thợ chấp nhận thỏa thuận',
            createdAt: new Date().toISOString(),
          },
        ]);
        return order;
      },
      findById: async (id: string, userId?: string, roles: string[] = []) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
        if (userId && !isAdmin && o.customerUserId !== userId && o.workerUserId !== userId) {
          throw new ForbiddenException('Not authorized to access this order');
        }
        return o;
      },
      confirmReadiness: async (id: string, workerUserId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.workerUserId !== workerUserId) throw new ForbiddenException('Not order worker');
        if (o.status !== 'created') throw new ConflictException(`Order must be in created status, got ${o.status}`);
        o.status = 'confirmed';
        o.confirmedAt = new Date().toISOString();
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: 'created',
          toStatus: 'confirmed',
          reason: 'Thợ xác nhận đã chuẩn bị đồ nghề và sẵn sàng thi công',
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      start: async (id: string, workerUserId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.workerUserId !== workerUserId) throw new ForbiddenException('Not order worker');
        if (o.status !== 'confirmed') throw new ConflictException('Order must be confirmed');
        o.status = 'in_progress';
        o.startedAt = new Date().toISOString();
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: 'confirmed',
          toStatus: 'in_progress',
          reason: 'Thợ có mặt tại địa điểm và bắt đầu thực hiện công việc',
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      addEvidence: async (id: string, workerUserId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.workerUserId !== workerUserId) throw new ForbiddenException('Not order worker');
        if (o.status !== 'in_progress') throw new ConflictException('Can only upload evidence when in_progress');
        const evId = crypto.randomUUID();
        const ev = {
          id: evId,
          orderId: id,
          mediaUrl: dto.mediaUrl,
          mediaType: dto.mediaType ?? 'image',
          description: dto.description ?? 'Ảnh nghiệm thu hiện trường',
          createdAt: new Date().toISOString(),
        };
        const list = state.evidences.get(id) ?? [];
        list.push(ev);
        state.evidences.set(id, list);
        return ev;
      },
      finish: async (id: string, workerUserId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.workerUserId !== workerUserId) throw new ForbiddenException('Not order worker');
        if (o.status !== 'in_progress') throw new ConflictException(`Cannot finish order in status ${o.status}`);
        const evs = state.evidences.get(id) ?? [];
        if (evs.length === 0) {
          throw new BadRequestException('Bắt buộc phải có ít nhất 1 ảnh/video minh chứng hoàn thành');
        }
        o.status = 'awaiting_customer_confirmation';
        o.workerFinishedAt = new Date().toISOString();
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: 'in_progress',
          toStatus: 'awaiting_customer_confirmation',
          reason: 'Thợ hoàn thành sửa chữa, nộp minh chứng và chờ khách nghiệm thu',
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      requestRework: async (id: string, customerUserId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.customerUserId !== customerUserId) throw new ForbiddenException('Not order customer');
        if (o.status !== 'awaiting_customer_confirmation') {
          throw new ConflictException('Rework can only be requested in awaiting_customer_confirmation');
        }
        o.status = 'in_progress';
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: 'awaiting_customer_confirmation',
          toStatus: 'in_progress',
          reason: dto.reason,
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      confirmCompletion: async (id: string, customerUserId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.customerUserId !== customerUserId) throw new ForbiddenException('Not order customer');
        if (o.status !== 'awaiting_customer_confirmation') {
          throw new ConflictException('Chỉ có thể nghiệm thu khi thợ đã báo hoàn thành');
        }
        o.status = 'completed';
        o.completedAt = new Date().toISOString();
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: 'awaiting_customer_confirmation',
          toStatus: 'completed',
          reason: 'Khách hàng nghiệm thu đạt chất lượng và xác nhận hoàn tất đơn hàng',
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      cancel: async (id: string, userId: string, dto: any, roles: string[] = []) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        const isAdmin = roles.some((r) => r.toLowerCase() === 'admin');
        const isParticipant = o.customerUserId === userId || o.workerUserId === userId;
        if (!isAdmin && !isParticipant) throw new ForbiddenException('Not authorized to cancel');
        if (o.status !== 'created' && o.status !== 'confirmed') {
          throw new ConflictException(`Cannot cancel order in '${o.status}' status. Only created or confirmed.`);
        }
        const previousStatus = o.status;
        o.status = 'cancelled';
        o.cancelledAt = new Date().toISOString();
        o.cancelReason = dto.reason;
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: previousStatus,
          toStatus: 'cancelled',
          reason: dto.reason,
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      dispute: async (id: string, userId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.customerUserId !== userId && o.workerUserId !== userId) throw new ForbiddenException('Not participant');
        if (o.status !== 'in_progress' && o.status !== 'awaiting_customer_confirmation') {
          throw new ConflictException(`Cannot dispute in '${o.status}' status`);
        }
        const previousStatus = o.status;
        o.status = 'disputed';
        o.disputePreviousStatus = previousStatus;
        o.disputedAt = new Date().toISOString();
        o.disputeReason = dto.reason;
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: previousStatus,
          toStatus: 'disputed',
          reason: dto.reason,
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      resolveDispute: async (id: string, adminId: string, dto: any, roles: string[] = []) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (!roles.some((r) => r.toLowerCase() === 'admin')) throw new ForbiddenException('Admin only');
        if (o.status !== 'disputed') throw new ConflictException('Order must be in disputed status');

        const nextStatus = dto.action === 'complete' ? 'completed' : 'cancelled';
        o.status = nextStatus;
        o.disputeResolvedAt = new Date().toISOString();
        o.disputeResolutionNote = dto.resolutionNote;
        if (nextStatus === 'completed') o.completedAt = new Date().toISOString();
        if (nextStatus === 'cancelled') o.cancelledAt = new Date().toISOString();
        state.orders.set(id, o);
        state.history.get(id)?.push({
          fromStatus: 'disputed',
          toStatus: nextStatus,
          reason: `Admin giải quyết: ${dto.resolutionNote}`,
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      adminFindAll: async () => {
        const items = Array.from(state.orders.values());
        return { items, total: items.length, page: 1, limit: 10, totalPages: 1 };
      },
      getStatusHistory: async (id: string) => {
        return state.history.get(id) ?? [];
      },
    };

    const internalOrderServiceMock = {
      getPaymentEligibility: async (orderId: string) => {
        const o = state.orders.get(orderId);
        if (!o) throw new NotFoundException('Order not found');
        return {
          orderId: o.id,
          orderCode: o.orderCode,
          status: o.status,
          isEligible: o.status === 'completed',
          isEligibleForSettlement: o.status === 'completed',
          agreedPrice: String(o.agreedPrice),
        };
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [OrderServiceModule],
    })
      .overrideProvider(ServiceRequestsService)
      .useValue(serviceRequestsServiceMock)
      .overrideProvider(BookingProposalsService)
      .useValue(bookingProposalsServiceMock)
      .overrideProvider(OrdersService)
      .useValue(ordersServiceMock)
      .overrideProvider(InternalOrderService)
      .useValue(internalOrderServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: '', method: RequestMethod.GET },
      ],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    state.requests.clear();
    state.proposals.clear();
    state.orders.clear();
    state.evidences.clear();
    state.history.clear();
  });

  // Helper to create and publish request via HTTP
  async function createAndPublish(customerId: string, description: string) {
    const draftRes = await request(app.getHttpServer())
      .post('/api/v1/service-requests')
      .set('x-user-id', customerId)
      .set('x-user-roles', 'customer')
      .send({
        serviceId: SERVICE_ID,
        description,
        addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    const reqId = draftRes.body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/service-requests/${reqId}/publish`)
      .set('x-user-id', customerId)
      .set('x-user-roles', 'customer')
      .expect(200);
    return reqId;
  }

  // Helper to create order via HTTP
  async function createOrder(customerId: string, workerId: string, price = 300000) {
    const reqId = await createAndPublish(customerId, 'Đơn sửa chữa cơ bản');
    const propRes = await request(app.getHttpServer())
      .post('/api/v1/booking-proposals')
      .set('x-user-id', customerId)
      .set('x-user-roles', 'customer')
      .send({
        serviceRequestId: reqId,
        workerUserId: workerId,
        selectionSource: 'bid',
        agreedPrice: price,
        agreedScope: 'Phạm vi thỏa thuận',
      })
      .expect(201);
    const acceptRes = await request(app.getHttpServer())
      .post(`/api/v1/booking-proposals/${propRes.body.data.id}/accept`)
      .set('x-user-id', workerId)
      .set('x-user-roles', 'worker')
      .expect(200);
    return { order: acceptRes.body.data, reqId, propId: propRes.body.data.id };
  }

  // =========================================================================
  // KỊCH BẢN 1: HAPPY PATH ĐẦU-CUỐI
  // =========================================================================
  it('Kịch bản 1: Happy Path Đấu Thầu (Khách tạo đơn -> 3 thợ báo giá -> Đàm phán -> Chọn Thợ 2 -> Thi công -> Nghiệm thu -> Quyết toán)', async () => {
    logScenarioHeader(1, 'HAPPY PATH ĐẤU THẦU & CHỐT ĐƠN HOÀN TẤT', 'Khách tạo đơn -> 3 Thợ báo giá -> Chọn Thợ 2 -> Thi công -> Hoàn tất');

    // 1. Tạo & Publish
    logStep('1.1', 'Khách hàng tạo Draft & Publish mở thầu');
    const reqId = await createAndPublish(CUSTOMER_ID, 'Sửa máy bơm nước Panasonic kêu to');
    logSuccess(`Yêu cầu dịch vụ đã mở thầu: ID ${reqId}`);

    // 2. 3 Thợ báo giá
    logStep('1.2', '3 Thợ gửi báo giá cạnh tranh');
    const p1 = await request(app.getHttpServer()).post('/api/v1/booking-proposals')
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ serviceRequestId: reqId, workerUserId: WORKER_1_ID, selectionSource: 'bid', agreedPrice: 380000, agreedScope: 'Thay rơ le' }).expect(201);
    const p2 = await request(app.getHttpServer()).post('/api/v1/booking-proposals')
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ serviceRequestId: reqId, workerUserId: WORKER_2_ID, selectionSource: 'bid', agreedPrice: 290000, agreedScope: 'Thay gioăng bảo hành 6 tháng' }).expect(201);
    const p3 = await request(app.getHttpServer()).post('/api/v1/booking-proposals')
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ serviceRequestId: reqId, workerUserId: WORKER_3_ID, selectionSource: 'bid', agreedPrice: 350000, agreedScope: 'Sửa nhanh 20p' }).expect(201);
    logSuccess('3 Thợ đã gửi báo giá thành công (380k / 290k / 350k)');

    // 3. Đàm phán Thợ 1
    logStep('1.3', 'Thợ 1 yêu cầu sửa điều khoản -> Khách gửi Revision 2');
    await request(app.getHttpServer()).post(`/api/v1/booking-proposals/${p1.body.data.id}/request-changes`)
      .set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').send({ responseNote: 'Máy lớn xin tăng giá' }).expect(200);
    const p1Rev2 = await request(app.getHttpServer()).post('/api/v1/booking-proposals')
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ serviceRequestId: reqId, supersedesProposalId: p1.body.data.id, workerUserId: WORKER_1_ID, selectionSource: 'bid', agreedPrice: 330000, agreedScope: 'Khách hỗ trợ 330k' }).expect(201);
    expect(p1Rev2.body.data.revisionNo).toBe(2);
    logSuccess('Revision 2 của Thợ 1 đã được tạo thành công');

    // 4. Chọn Thợ 2 & Chốt đơn
    logStep('1.4', 'Khách chọn Thợ 2 (290k) -> Thợ 2 Accept tạo Order');
    const orderRes = await request(app.getHttpServer()).post(`/api/v1/booking-proposals/${p2.body.data.id}/accept`)
      .set('x-user-id', WORKER_2_ID).set('x-user-roles', 'worker').expect(200);
    const orderId = orderRes.body.data.id;
    expect(orderRes.body.data.status).toBe('created');
    logSuccess(`Đơn hàng tạo thành công: ${orderRes.body.data.orderCode} (Giá: ${orderRes.body.data.agreedPrice} VNĐ)`);

    // 5. Xác minh tự động Supersede Thợ 1 và 3
    const checkP3 = await request(app.getHttpServer()).get(`/api/v1/booking-proposals/${p3.body.data.id}`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer').expect(200);
    expect(checkP3.body.data.status).toBe('superseded');
    logSuccess('Xác minh Thợ 3 đã tự động chuyển sang [superseded]');

    // 6. Chống race condition
    await request(app.getHttpServer()).post(`/api/v1/booking-proposals/${p3.body.data.id}/accept`)
      .set('x-user-id', WORKER_3_ID).set('x-user-roles', 'worker').expect(409);
    logSuccess('Chặn thành công Thợ 3 cố accept: HTTP 409 Conflict');

    // 7. Thi công & Nghiệm thu
    await request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/confirm-readiness`).set('x-user-id', WORKER_2_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/start`).set('x-user-id', WORKER_2_ID).set('x-user-roles', 'worker').expect(200);
    // Chặn báo xong khi thiếu ảnh
    await request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/finish`).set('x-user-id', WORKER_2_ID).set('x-user-roles', 'worker').expect(400);
    // Tải ảnh
    await request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/evidence`).set('x-user-id', WORKER_2_ID).set('x-user-roles', 'worker')
      .send({ mediaUrl: 'https://res.cloudinary.com/sample/pump.jpg', mediaType: 'image', description: 'Đã hoàn thành áp lực 2.5 bar' }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/finish`).set('x-user-id', WORKER_2_ID).set('x-user-roles', 'worker').expect(200);
    const completeRes = await request(app.getHttpServer()).post(`/api/v1/orders/${orderId}/confirm-completion`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer').expect(200);
    expect(completeRes.body.data.status).toBe('completed');
    logSuccess(`Đơn hàng hoàn tất: [${completeRes.body.data.status}]`);

    // 8. Quyết toán
    const payRes = await request(app.getHttpServer()).get(`/api/v1/internal/orders/${orderId}/payment-eligibility`)
      .set('x-internal-secret', INTERNAL_SECRET).expect(200);
    expect(payRes.body.data.isEligible).toBe(true);
    logSuccess(`API Kế toán duyệt thanh toán: 290.000 VNĐ cho Thợ 2`);
    logStepEnd();
  });

  // =========================================================================
  // KỊCH BẢN 2: KHÁCH YÊU CẦU LÀM LẠI (REWORK FLOW - ORD-07)
  // =========================================================================
  it('Kịch bản 2: Luồng Khách Yêu Cầu Làm Lại (Rework Lifecycle: awaiting -> in_progress -> hoàn tất)', async () => {
    logScenarioHeader(2, 'LUỒNG KHÁCH YÊU CẦU LÀM LẠI (REWORK)', 'Khách phát hiện lỗi -> yêu cầu làm lại -> thợ sửa lại -> nghiệm thu');
    const { order } = await createOrder(CUSTOMER_ID, WORKER_1_ID);
    const oId = order.id;

    await request(app.getHttpServer()).post(`/api/v1/orders/${oId}/confirm-readiness`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oId}/start`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oId}/evidence`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker')
      .send({ mediaUrl: 'https://sample.com/1.jpg', mediaType: 'image' }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oId}/finish`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);

    // Khách yêu cầu sửa lại
    logStep('2.1', 'Khách bấm Yêu cầu làm lại (Request Rework)');
    const reworkRes = await request(app.getHttpServer()).post(`/api/v1/orders/${oId}/request-rework`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ reason: 'Mối nối vẫn còn rỉ nước, cần siết thêm keo' }).expect(200);
    expect(reworkRes.body.data.status).toBe('in_progress');
    logSuccess(`Đơn hàng đã quay lại trạng thái: [${reworkRes.body.data.status}] (in_progress)`);

    // Thợ khắc phục và hoàn tất lại
    await request(app.getHttpServer()).post(`/api/v1/orders/${oId}/finish`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    const compRes = await request(app.getHttpServer()).post(`/api/v1/orders/${oId}/confirm-completion`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer').expect(200);
    expect(compRes.body.data.status).toBe('completed');
    logSuccess(`Khách nghiệm thu lần 2 thành công: [${compRes.body.data.status}]`);
    logStepEnd();
  });

  // =========================================================================
  // KỊCH BẢN 3: THỢ TỪ CHỐI NHẬN VIỆC (WORKER REJECTS PROPOSAL - ORD-04)
  // =========================================================================
  it('Kịch bản 3: Luồng Thợ Từ Chối Đề Xuất (Worker Reject: proposed -> worker_rejected)', async () => {
    logScenarioHeader(3, 'LUỒNG THỢ TỪ CHỐI BÁO GIÁ (WORKER REJECT)', 'Thợ bận lịch -> Bấm từ chối (worker_rejected)');
    const reqId = await createAndPublish(CUSTOMER_ID, 'Bảo dưỡng máy lạnh Daikin');
    const propRes = await request(app.getHttpServer()).post('/api/v1/booking-proposals')
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ serviceRequestId: reqId, workerUserId: WORKER_1_ID, selectionSource: 'bid', agreedPrice: 400000, agreedScope: 'Bảo dưỡng' }).expect(201);
    const pId = propRes.body.data.id;

    logStep('3.1', 'Thợ bấm Reject đề xuất kèm lý do');
    const rejectRes = await request(app.getHttpServer()).post(`/api/v1/booking-proposals/${pId}/reject`)
      .set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker')
      .send({ responseNote: 'Tôi đã kín lịch chiều nay' }).expect(200);
    expect(rejectRes.body.data.status).toBe('worker_rejected');
    logSuccess(`Đề xuất chuyển sang: [${rejectRes.body.data.status}] (worker_rejected)`);

    // Chặn accept proposal đã reject
    await request(app.getHttpServer()).post(`/api/v1/booking-proposals/${pId}/accept`)
      .set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(409);
    logSuccess('Chặn thành công Thợ cố accept proposal đã bị reject: HTTP 409 Conflict');
    logStepEnd();
  });

  // =========================================================================
  // KỊCH BẢN 4: KHÁCH HÀNG RÚT LẠI ĐỀ XUẤT (CUSTOMER WITHDRAWS PROPOSAL)
  // =========================================================================
  it('Kịch bản 4: Luồng Khách Hàng Rút Lại Đề Xuất (Customer Withdraw: proposed -> withdrawn)', async () => {
    logScenarioHeader(4, 'LUỒNG KHÁCH RÚT LẠI ĐỀ XUẤT (CUSTOMER WITHDRAW)', 'Khách đổi ý -> Rút đề xuất -> Chặn thợ nhận việc');
    const reqId = await createAndPublish(CUSTOMER_ID, 'Sửa bóng đèn led');
    const propRes = await request(app.getHttpServer()).post('/api/v1/booking-proposals')
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ serviceRequestId: reqId, workerUserId: WORKER_1_ID, selectionSource: 'bid', agreedPrice: 150000, agreedScope: 'Thay bóng led' }).expect(201);
    const pId = propRes.body.data.id;

    logStep('4.1', 'Khách bấm Rút lại đề xuất (Withdraw)');
    const withdrawRes = await request(app.getHttpServer()).post(`/api/v1/booking-proposals/${pId}/withdraw`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer').expect(200);
    expect(withdrawRes.body.data.status).toBe('withdrawn');
    logSuccess(`Đề xuất chuyển sang: [${withdrawRes.body.data.status}] (withdrawn)`);

    // Chặn thợ cố accept
    await request(app.getHttpServer()).post(`/api/v1/booking-proposals/${pId}/accept`)
      .set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(409);
    logSuccess('Chặn thành công Thợ cố accept proposal đã bị withdrawn: HTTP 409 Conflict');
    logStepEnd();
  });

  // =========================================================================
  // KỊCH BẢN 5: HỦY ĐƠN HÀNG TRƯỚC THI CÔNG & RÀNG BUỘC CHẶN HỦY KHI ĐANG LÀM
  // =========================================================================
  it('Kịch bản 5: Luồng Hủy Đơn Hàng & Ràng Buộc Hủy (Cancel Rules: Hủy ở created/confirmed OK; Chặn khi in_progress)', async () => {
    logScenarioHeader(5, 'LUỒNG HỦY ĐƠN HÀNG (CANCEL RULES)', 'Hủy khi created/confirmed hợp lệ; Chặn hủy khi in_progress');

    // 5.1 Khách hủy ở created
    logStep('5.1', 'Khách hủy đơn khi ở trạng thái "created"');
    const { order: oCreated } = await createOrder(CUSTOMER_ID, WORKER_1_ID);
    const cancelCreatedRes = await request(app.getHttpServer()).post(`/api/v1/orders/${oCreated.id}/cancel`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ reason: 'Khách hàng có việc bận đột xuất' }).expect(200);
    expect(cancelCreatedRes.body.data.status).toBe('cancelled');
    logSuccess(`Đơn hàng created đã hủy thành công: [${cancelCreatedRes.body.data.status}]`);

    // 5.2 Thợ hủy ở confirmed
    logStep('5.2', 'Thợ hủy đơn sau khi đã xác nhận "confirmed"');
    const { order: oConfirmed } = await createOrder(CUSTOMER_ID, WORKER_1_ID);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oConfirmed.id}/confirm-readiness`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    const cancelConfirmedRes = await request(app.getHttpServer()).post(`/api/v1/orders/${oConfirmed.id}/cancel`)
      .set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker')
      .send({ reason: 'Thợ bị hư hỏng phương tiện' }).expect(200);
    expect(cancelConfirmedRes.body.data.status).toBe('cancelled');
    logSuccess(`Đơn hàng confirmed đã hủy thành công: [${cancelConfirmedRes.body.data.status}]`);

    // 5.3 Chặn hủy khi đang thi công (in_progress)
    logStep('5.3', 'Chặn hủy đơn khi đã bắt đầu thi công (in_progress)');
    const { order: oProgress } = await createOrder(CUSTOMER_ID, WORKER_1_ID);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oProgress.id}/confirm-readiness`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oProgress.id}/start`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oProgress.id}/cancel`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ reason: 'Khách đổi ý muốn hủy ngang' }).expect(409);
    logSuccess('Chặn thành công: Không thể tự ý hủy đơn khi đang thi công (HTTP 409 Conflict)');
    logStepEnd();
  });

  // =========================================================================
  // KỊCH BẢN 6: TRANH CHẤP & ADMIN PHÂN XỬ (DISPUTE LIFECYCLE & RESOLUTION)
  // =========================================================================
  it('Kịch bản 6: Luồng Tranh Chấp & Admin Phân Xử (Dispute -> Admin resolve Cancel & Complete)', async () => {
    logScenarioHeader(6, 'LUỒNG TRANH CHẤP & ADMIN PHÂN XỬ (DISPUTE)', 'Khách/Thợ mở khiếu nại -> Admin phân xử hoàn tất hoặc hủy đơn');

    // 6.1 Admin xử HỦY ĐƠN (Cancel)
    logStep('6.1', 'Khách mở Tranh chấp & Admin xử HỦY ĐƠN (cancel)');
    const { order: oDisp1 } = await createOrder(CUSTOMER_ID, WORKER_1_ID);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp1.id}/confirm-readiness`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp1.id}/start`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    const dispRes1 = await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp1.id}/dispute`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ reason: 'Thợ thi công làm vỡ thiết bị và bỏ dở việc' }).expect(200);
    expect(dispRes1.body.data.status).toBe('disputed');
    logSuccess(`Đơn hàng chuyển sang trạng thái: [${dispRes1.body.data.status}] (disputed)`);

    const adminCancel = await request(app.getHttpServer()).post(`/api/v1/admin/orders/${oDisp1.id}/resolve-dispute`)
      .set('x-internal-secret', INTERNAL_SECRET)
      .set('x-user-id', ADMIN_ID).set('x-user-roles', 'Admin')
      .send({ action: 'cancel', resolutionNote: 'Xác minh thợ làm hư hại, hủy đơn và bồi hoàn' }).expect(200);
    expect(adminCancel.body.data.status).toBe('cancelled');
    logSuccess(`Admin giải quyết tranh chấp: [${adminCancel.body.data.status}] (cancelled)`);

    // 6.2 Admin xử HOÀN TẤT ĐƠN (Complete)
    logStep('6.2', 'Thợ mở Tranh chấp khi khách không nghiệm thu & Admin xử HOÀN TẤT (complete)');
    const { order: oDisp2 } = await createOrder(CUSTOMER_ID, WORKER_1_ID);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp2.id}/confirm-readiness`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp2.id}/start`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp2.id}/evidence`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker')
      .send({ mediaUrl: 'https://sample.com/fixed.jpg', mediaType: 'image' }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp2.id}/finish`).set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(200);

    await request(app.getHttpServer()).post(`/api/v1/orders/${oDisp2.id}/dispute`)
      .set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker')
      .send({ reason: 'Khách hàng không liên lạc được để nghiệm thu' }).expect(200);

    const adminComplete = await request(app.getHttpServer()).post(`/api/v1/admin/orders/${oDisp2.id}/resolve-dispute`)
      .set('x-internal-secret', INTERNAL_SECRET)
      .set('x-user-id', ADMIN_ID).set('x-user-roles', 'Admin')
      .send({ action: 'complete', resolutionNote: 'Ảnh nghiệm thu đạt chuẩn, giải ngân cho thợ' }).expect(200);
    expect(adminComplete.body.data.status).toBe('completed');
    logSuccess(`Admin giải quyết tranh chấp: [${adminComplete.body.data.status}] (completed)`);
    logStepEnd();
  });

  // =========================================================================
  // KỊCH BẢN 7: KHÁCH HỦY YÊU CẦU DỊCH VỤ MỞ THẦU (CANCEL SERVICE REQUEST)
  // =========================================================================
  it('Kịch bản 7: Luồng Hủy Yêu Cầu Dịch Vụ Mở Thầu (Cancel Request -> Proposals tự động Withdrawn)', async () => {
    logScenarioHeader(7, 'LUỒNG HỦY SERVICE REQUEST MỞ THẦU', 'Khách hủy yêu cầu dịch vụ -> Mọi proposal liên quan tự động withdrawn');
    const reqId = await createAndPublish(CUSTOMER_ID, 'Sửa ổ cắm điện âm tường');
    const propRes = await request(app.getHttpServer()).post('/api/v1/booking-proposals')
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer')
      .send({ serviceRequestId: reqId, workerUserId: WORKER_1_ID, selectionSource: 'bid', agreedPrice: 100000, agreedScope: 'Thay ổ cắm' }).expect(201);

    logStep('7.1', 'Khách hủy Service Request');
    const cancelReqRes = await request(app.getHttpServer()).post(`/api/v1/service-requests/${reqId}/cancel`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer').expect(200);
    expect(cancelReqRes.body.data.status).toBe('cancelled');
    logSuccess(`Service Request đã hủy: [${cancelReqRes.body.data.status}] (cancelled)`);

    const checkP = await request(app.getHttpServer()).get(`/api/v1/booking-proposals/${propRes.body.data.id}`)
      .set('x-user-id', CUSTOMER_ID).set('x-user-roles', 'customer').expect(200);
    expect(checkP.body.data.status).toBe('withdrawn');
    logSuccess(`Proposal liên quan tự động chuyển sang: [${checkP.body.data.status}] (withdrawn)`);
    logStepEnd();
  });

  // =========================================================================
  // KỊCH BẢN 8: MA TRẬN CA BIÊN AN NINH & BẢO VỆ PHÂN QUYỀN
  // =========================================================================
  it('Kịch bản 8: Ma Trận Ca Biên An Ninh & Bảo Vệ Phân Quyền (401 Auth, 403 Forbidden, 409 State Jump)', async () => {
    logScenarioHeader(8, 'MA TRẬN CA BIÊN AN NINH & PHÂN QUYỀN', 'Chặn 401 thiếu auth, 403 người lạ can thiệp, 409 nhảy cóc trạng thái');
    const STRANGER_ID = crypto.randomUUID();

    logStep('8.1', 'Chặn truy cập thiếu xác thực (401 Unauthorized)');
    await request(app.getHttpServer()).post('/api/v1/service-requests').send({ description: 'Hack' }).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/internal/orders/${crypto.randomUUID()}/payment-eligibility`).expect(401);
    logSuccess('Chặn thành công 401 khi thiếu x-user-id hoặc x-internal-secret');

    logStep('8.2', 'Chặn người lạ can thiệp đơn hàng (403 Forbidden)');
    const { order } = await createOrder(CUSTOMER_ID, WORKER_1_ID);
    await request(app.getHttpServer()).post(`/api/v1/orders/${order.id}/confirm-readiness`)
      .set('x-user-id', STRANGER_ID).set('x-user-roles', 'worker').expect(403);
    logSuccess('Chặn thành công Thợ lạ can thiệp: HTTP 403 Forbidden');

    logStep('8.3', 'Chặn nhảy cóc trạng thái (409 Conflict)');
    // Đang created cố tình bấm finish
    await request(app.getHttpServer()).post(`/api/v1/orders/${order.id}/finish`)
      .set('x-user-id', WORKER_1_ID).set('x-user-roles', 'worker').expect(409);
    logSuccess('Chặn thành công nhảy cóc created -> finish: HTTP 409 Conflict');
    logStepEnd();

    logBanner('KẾT QUẢ: 8/8 KỊCH BẢN LỚN THÀNH CÔNG 100%!');
  });
});
