import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  type INestApplication,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppException, HttpExceptionFilter } from '@app/common';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service.js';
import { BookingProposalsService } from '../src/booking-proposals/booking-proposals.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { InternalOrderService } from '../src/internal/internal-order.service.js';
import { OrderServiceModule } from '../src/order-service.module.js';

describe('OrderService E2E Test Suite (Comprehensive Lifecycle)', () => {
  let app: INestApplication<App>;

  const CUSTOMER_ID = crypto.randomUUID();
  const WORKER_1_ID = crypto.randomUUID();
  const _WORKER_2_ID = crypto.randomUUID();
  const ADMIN_ID = crypto.randomUUID();
  const SERVICE_ID = crypto.randomUUID();
  const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'handy-go-internal-service-secret-key-12345';

  // In-memory simulation state for full order lifecycle
  const state = {
    requests: new Map<string, any>(),
    proposals: new Map<string, any>(),
    orders: new Map<string, any>(),
    evidences: new Map<string, any[]>(),
    history: new Map<string, any[]>(),
  };

  beforeAll(async () => {
    const serviceRequestsServiceMock = {
      createDraft: async (userId: string, dto: any) => {
        const id = crypto.randomUUID();
        const record = {
          id,
          requestCode: 'REQ-E2E-001',
          customerUserId: userId,
          serviceId: dto.serviceId ?? SERVICE_ID,
          description: dto.description ?? 'Test request',
          addressText: dto.addressText ?? '123 Test St, Da Nang',
          latitude: dto.latitude !== undefined ? dto.latitude : null,
          longitude: dto.longitude !== undefined ? dto.longitude : null,
          scheduledAt: dto.scheduledAt ?? new Date(Date.now() + 86400000).toISOString(),
          aiRefPriceMin: dto.aiRefPriceMin ?? '200000',
          aiRefPriceMax: dto.aiRefPriceMax ?? '350000',
          status: 'draft',
          media: dto.media ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.requests.set(id, record);
        return record;
      },
      findAll: async (userId: string, _query: any) => {
        const items = Array.from(state.requests.values()).filter(
          (r) => r.customerUserId === userId,
        );
        return {
          items,
          total: items.length,
          page: 1,
          limit: 10,
          totalPages: 1,
        };
      },
      findById: async (id: string, _userId: string, _roles: string[]) => {
        const req = state.requests.get(id);
        if (!req) {
          throw new NotFoundException('Service request not found');
        }
        return req;
      },
      updateDraft: async (id: string, _userId: string, dto: any) => {
        const req = state.requests.get(id);
        if (!req) {
          throw new NotFoundException('Service request not found');
        }
        if (req.status !== 'draft') {
          throw new ConflictException('Can only update draft requests');
        }
        const updated = { ...req, ...dto, updatedAt: new Date().toISOString() };
        state.requests.set(id, updated);
        return updated;
      },
      publish: async (id: string, _userId: string) => {
        const req = state.requests.get(id);
        if (!req) {
          throw new NotFoundException('Service request not found');
        }
        if (req.latitude === null || req.latitude === undefined || req.longitude === null || req.longitude === undefined) {
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'INCOMPLETE_PUBLISH_PAYLOAD',
            'Cannot publish request missing required fields: latitude, longitude',
          );
        }
        const now = new Date();
        const updated = {
          ...req,
          status: 'open_for_bidding',
          publishedAt: now.toISOString(),
          biddingClosesAt: new Date(now.getTime() + 86400000).toISOString(),
          selectionExpiresAt: new Date(now.getTime() + 172800000).toISOString(),
          updatedAt: now.toISOString(),
        };
        state.requests.set(id, updated);
        return updated;
      },
      cancel: async (id: string, _userId: string) => {
        const req = state.requests.get(id);
        if (!req) {
          throw new NotFoundException('Service request not found');
        }
        const updated = { ...req, status: 'cancelled', updatedAt: new Date().toISOString() };
        state.requests.set(id, updated);
        return updated;
      },
    };

    const bookingProposalsServiceMock = {
      create: async (userId: string, dto: any) => {
        const id = crypto.randomUUID();
        const proposal = {
          id,
          serviceRequestId: dto.serviceRequestId,
          customerUserId: userId,
          workerUserId: dto.workerUserId,
          selectionSource: dto.selectionSource ?? 'bid',
          agreedPrice: dto.agreedPrice,
          agreedScope: dto.agreedScope,
          revisionNo: 1,
          status: 'proposed',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          createdAt: new Date().toISOString(),
        };
        state.proposals.set(id, proposal);
        return proposal;
      },
      findAll: async (userId: string, _query: any, _roles: string[]) => {
        const items = Array.from(state.proposals.values()).filter(
          (p) => p.customerUserId === userId || p.workerUserId === userId,
        );
        return { items, total: items.length, page: 1, limit: 10, totalPages: 1 };
      },
      findMyReceivedProposals: async (workerUserId: string, _query: any) => {
        const items = Array.from(state.proposals.values()).filter(
          (p) => p.workerUserId === workerUserId,
        );
        return { items, total: items.length, page: 1, limit: 10, totalPages: 1 };
      },
      findByServiceRequestId: async (serviceRequestId: string) => {
        return Array.from(state.proposals.values()).filter(
          (p) => p.serviceRequestId === serviceRequestId,
        );
      },
      findById: async (id: string) => {
        const p = state.proposals.get(id);
        if (!p) {
          throw new NotFoundException('Proposal not found');
        }
        return p;
      },
      requestChanges: async (id: string, _workerUserId: string, note: string) => {
        const p = state.proposals.get(id);
        if (!p) {
          throw new NotFoundException('Proposal not found');
        }
        const updated = {
          ...p,
          status: 'changes_requested',
          responseNote: note,
          workerRespondedAt: new Date().toISOString(),
        };
        state.proposals.set(id, updated);
        return updated;
      },
    };

    const ordersServiceMock = {
      acceptProposal: async (id: string, workerUserId: string) => {
        const p = state.proposals.get(id);
        if (!p) {
          throw new NotFoundException('Proposal not found');
        }
        p.status = 'finalized';
        state.proposals.set(id, p);

        // Mark request as converted
        const req = state.requests.get(p.serviceRequestId);
        if (req) {
          req.status = 'converted_to_order';
          state.requests.set(req.id, req);
        }

        const orderId = crypto.randomUUID();
        const order = {
          id: orderId,
          orderCode: 'ORD-E2E-001',
          serviceRequestId: p.serviceRequestId,
          bookingProposalId: p.id,
          customerUserId: p.customerUserId,
          workerUserId,
          serviceId: req?.serviceId ?? SERVICE_ID,
          agreedPrice: String(p.agreedPrice),
          agreedScope: p.agreedScope,
          addressText: req?.addressText ?? '123 Test St, Da Nang',
          status: 'created',
          paymentState: 'unpaid',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.orders.set(orderId, order);
        state.history.set(orderId, [
          { fromStatus: null, toStatus: 'created', createdAt: new Date().toISOString() },
        ]);
        return order;
      },
      findAll: async (userId: string, _query: any, _roles: string[] = []) => {
        const items = Array.from(state.orders.values()).filter(
          (o) => o.customerUserId === userId || o.workerUserId === userId,
        );
        return { items, total: items.length, page: 1, limit: 10, totalPages: 1 };
      },
      findById: async (id: string, _userId: string, _roles: string[] = []) => {
        const o = state.orders.get(id);
        if (!o) {
          throw new NotFoundException('Order not found');
        }
        return o;
      },
      getStatusHistory: async (id: string) => {
        return state.history.get(id) ?? [];
      },
      confirmReadiness: async (id: string, _workerUserId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.status !== 'created') throw new ConflictException('Order must be in created status');
        o.status = 'confirmed';
        o.confirmedAt = new Date().toISOString();
        state.orders.set(id, o);
        const hist = state.history.get(id) ?? [];
        hist.push({ fromStatus: 'created', toStatus: 'confirmed', createdAt: new Date().toISOString() });
        return o;
      },
      start: async (id: string, _workerUserId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        if (o.status !== 'confirmed') throw new ConflictException('Order must be confirmed');
        o.status = 'in_progress';
        o.startedAt = new Date().toISOString();
        state.orders.set(id, o);
        const hist = state.history.get(id) ?? [];
        hist.push({ fromStatus: 'confirmed', toStatus: 'in_progress', createdAt: new Date().toISOString() });
        return o;
      },
      addEvidence: async (id: string, _workerUserId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        const evId = crypto.randomUUID();
        const evidence = {
          id: evId,
          orderId: id,
          mediaUrl: dto.mediaUrl,
          mediaType: dto.mediaType ?? 'image',
          description: dto.description ?? 'Proof of work',
          createdAt: new Date().toISOString(),
        };
        const list = state.evidences.get(id) ?? [];
        list.push(evidence);
        state.evidences.set(id, list);
        return evidence;
      },
      getEvidences: async (id: string) => {
        return state.evidences.get(id) ?? [];
      },
      deleteEvidence: async (id: string, evidenceId: string) => {
        const list = state.evidences.get(id) ?? [];
        state.evidences.set(
          id,
          list.filter((e) => e.id !== evidenceId),
        );
      },
      finish: async (id: string, _workerUserId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        const evs = state.evidences.get(id) ?? [];
        if (evs.length === 0) {
          throw new BadRequestException('At least one evidence is required before finishing');
        }
        o.status = 'awaiting_customer_confirmation';
        o.workerFinishedAt = new Date().toISOString();
        state.orders.set(id, o);
        const hist = state.history.get(id) ?? [];
        hist.push({
          fromStatus: 'in_progress',
          toStatus: 'awaiting_customer_confirmation',
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      requestRework: async (id: string, _userId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        o.status = 'in_progress';
        state.orders.set(id, o);
        const hist = state.history.get(id) ?? [];
        hist.push({
          fromStatus: 'awaiting_customer_confirmation',
          toStatus: 'in_progress',
          reason: dto.reason,
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      confirmCompletion: async (id: string, _userId: string) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        o.status = 'completed';
        o.completedAt = new Date().toISOString();
        state.orders.set(id, o);
        const hist = state.history.get(id) ?? [];
        hist.push({
          fromStatus: 'awaiting_customer_confirmation',
          toStatus: 'completed',
          createdAt: new Date().toISOString(),
        });
        return o;
      },
      cancel: async (id: string, _userId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        o.status = 'cancelled';
        o.cancelledAt = new Date().toISOString();
        o.cancelReason = dto.cancelReason;
        state.orders.set(id, o);
        return o;
      },
      dispute: async (id: string, _userId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        o.status = 'disputed';
        o.disputedAt = new Date().toISOString();
        o.disputeReason = dto.reason;
        state.orders.set(id, o);
        return o;
      },
      adminFindAll: async (_query: any) => {
        const items = Array.from(state.orders.values());
        return { items, total: items.length, page: 1, limit: 10, totalPages: 1 };
      },
      resolveDispute: async (id: string, _adminId: string, dto: any) => {
        const o = state.orders.get(id);
        if (!o) throw new NotFoundException('Order not found');
        o.status = dto.action === 'complete' ? 'completed' : 'cancelled';
        state.orders.set(id, o);
        return o;
      },
    };

    const internalOrderServiceMock = {
      getBiddingEligibility: async (id: string) => {
        const req = state.requests.get(id);
        if (!req) throw new NotFoundException('Request not found');
        return {
          serviceRequestId: req.id,
          requestCode: req.requestCode,
          status: req.status,
          isEligible: req.status === 'open_for_bidding',
          biddingClosesAt: req.biddingClosesAt ?? new Date(Date.now() + 86400000).toISOString(),
        };
      },
      getPaymentEligibility: async (orderId: string) => {
        const o = state.orders.get(orderId);
        if (!o) throw new NotFoundException('Order not found');
        return {
          orderId: o.id,
          orderCode: o.orderCode,
          status: o.status,
          isEligible: o.status === 'completed',
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    // Reset test state before each scenario run
    state.requests.clear();
    state.proposals.clear();
    state.orders.clear();
    state.evidences.clear();
    state.history.clear();
  });

  // =========================================================================
  // 1. Health & Root Check
  // =========================================================================
  describe('1. Infrastructure & Health Endpoints', () => {
    it('GET /health -> returns 200 OK and service status', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('order-service');
    });

    it('GET / -> returns root Hello World', async () => {
      await request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
    });
  });

  // =========================================================================
  // 2. Security & Identity Guard Verification
  // =========================================================================
  describe('2. Security & Header Guards', () => {
    it('POST /api/v1/service-requests without x-user-id -> returns 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .send({ description: 'Testing auth guard' })
        .expect(401);
    });

    it('GET /api/v1/orders without x-user-id -> returns 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
    });

    it('GET /api/v1/internal/... without x-internal-secret -> returns 401 Unauthorized', async () => {
      const randomId = crypto.randomUUID();
      await request(app.getHttpServer())
        .get(`/api/v1/internal/service-requests/${randomId}/bidding-eligibility`)
        .expect(401);
    });

    it('GET /api/v1/internal/... with invalid x-internal-secret -> returns 401 Unauthorized', async () => {
      const randomId = crypto.randomUUID();
      await request(app.getHttpServer())
        .get(`/api/v1/internal/orders/${randomId}/payment-eligibility`)
        .set('x-internal-secret', 'wrong-internal-secret-token')
        .expect(401);
    });
  });

  // =========================================================================
  // 3. Full Service Requests Lifecycle
  // =========================================================================
  describe('3. Service Requests Lifecycle (ORD-02, ORD-03)', () => {
    it('rejects invalid payload with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({ latitude: 'invalid-coordinate' })
        .expect(400);
    });

    it('rejects out-of-bound GPS latitude (>90) with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({ latitude: 95.5, longitude: 108.1499 })
        .expect(400);
    });

    it('rejects publishing a draft missing GPS coordinates with 422 Unprocessable Entity', async () => {
      // Create draft without GPS
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({
          serviceId: SERVICE_ID,
          description: 'Yêu cầu thiếu tọa độ GPS',
          addressText: 'Chưa có tọa độ',
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        })
        .expect(201);

      const draftId = draftRes.body.data.id;

      // Attempt to publish without GPS
      const publishRes = await request(app.getHttpServer())
        .post(`/api/v1/service-requests/${draftId}/publish`)
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .expect(422);

      expect(publishRes.body.code).toBe('INCOMPLETE_PUBLISH_PAYLOAD');
      expect(publishRes.body.message).toContain('latitude');
    });

    it('creates draft request, lists it, updates fields, and publishes for bidding', async () => {
      // Step A: Create draft
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({
          serviceId: SERVICE_ID,
          description: 'Sửa bồn rửa chén rò rỉ nước',
          addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
          latitude: 16.0748,
          longitude: 108.1499,
          aiRefPriceMin: 200000,
          aiRefPriceMax: 350000,
          media: [{ mediaUrl: 'https://sample.cloudinary.com/pipe.jpg', mediaType: 'image' }],
        })
        .expect(201);

      expect(createRes.body.data.status).toBe('draft');
      const requestId = createRes.body.data.id;

      // Step B: List requests
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/service-requests')
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .expect(200);

      expect(listRes.body.data.items).toHaveLength(1);
      expect(listRes.body.data.items[0].id).toBe(requestId);

      // Step C: Update draft
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/service-requests/${requestId}`)
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({ description: 'Sửa bồn rửa chén rò rỉ nước (Đã bổ sung mô tả)' })
        .expect(200);

      expect(updateRes.body.data.description).toContain('Đã bổ sung mô tả');

      // Step D: Publish request
      const publishRes = await request(app.getHttpServer())
        .post(`/api/v1/service-requests/${requestId}/publish`)
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .expect(200);

      expect(publishRes.body.data.status).toBe('open_for_bidding');
      expect(publishRes.body.data.biddingClosesAt).toBeDefined();
      expect(publishRes.body.data.selectionExpiresAt).toBeDefined();
    });
  });

  // =========================================================================
  // 4. End-to-End Complete Order Lifecycle (ORD-06 -> ORD-10)
  // =========================================================================
  describe('4. Complete Order Lifecycle (Proposals -> Order -> Evidences -> Completion)', () => {
    it('executes full flow: propose -> change note -> accept -> readiness -> start -> evidence -> finish -> complete', async () => {
      // 1. Create & Publish Request
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/service-requests')
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({
          serviceId: SERVICE_ID,
          description: 'Thay khóa cửa chính bị kẹt chốt',
          addressText: '456 Lê Duẩn, Đà Nẵng',
          latitude: 16.06,
          longitude: 108.21,
          aiRefPriceMin: 250000,
          aiRefPriceMax: 400000,
        })
        .expect(201);
      const reqId = draftRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/service-requests/${reqId}/publish`)
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .expect(200);

      // 2. Submit Booking Proposal from Customer to Worker 1
      const propRes = await request(app.getHttpServer())
        .post('/api/v1/booking-proposals')
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({
          serviceRequestId: reqId,
          workerUserId: WORKER_1_ID,
          selectionSource: 'bid',
          agreedPrice: 300000,
          agreedScope: 'Thay toàn bộ ổ khóa mới loại tay gạt Hafele',
        })
        .expect(201);

      const propId = propRes.body.data.id;
      expect(propRes.body.data.status).toBe('proposed');

      // 3. Worker queries received proposals
      const workerPropsRes = await request(app.getHttpServer())
        .get('/api/v1/booking-proposals/me')
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .expect(200);

      expect(workerPropsRes.body.data.items).toHaveLength(1);

      // 4. Worker requests changes (e.g. increase cost)
      const changeRes = await request(app.getHttpServer())
        .post(`/api/v1/booking-proposals/${propId}/request-changes`)
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .send({ responseNote: 'Phát sinh thêm phụ kiện ruột khóa' })
        .expect(200);

      expect(changeRes.body.data.status).toBe('changes_requested');

      // 5. Worker Accepts Proposal -> Materializes Order (ORD-06)
      const acceptRes = await request(app.getHttpServer())
        .post(`/api/v1/booking-proposals/${propId}/accept`)
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .expect(200);

      const order = acceptRes.body.data;
      expect(order.status).toBe('created');
      expect(order.paymentState).toBe('unpaid');
      const orderId = order.id;

      // 6. Worker confirms readiness (ORD-07)
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/confirm-readiness`)
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .expect(200);
      expect(confirmRes.body.data.status).toBe('confirmed');

      // 7. Worker starts order (ORD-07)
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/start`)
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .expect(200);
      expect(startRes.body.data.status).toBe('in_progress');

      // 8. Worker attempts to finish WITHOUT evidence -> 400 Bad Request
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/finish`)
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .expect(400);

      // 9. Worker attaches proof of work evidence (ORD-10)
      const evRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/evidence`)
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .send({
          mediaUrl: 'https://res.cloudinary.com/sample/lock_fixed.jpg',
          mediaType: 'image',
          description: 'Ảnh chụp sau khi lắp khóa hoàn tất',
        })
        .expect(201);
      expect(evRes.body.data.id).toBeDefined();

      // 10. Worker reports work finished -> awaiting_customer_confirmation
      const finishRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/finish`)
        .set('x-user-id', WORKER_1_ID)
        .set('x-user-roles', 'worker')
        .expect(200);
      expect(finishRes.body.data.status).toBe('awaiting_customer_confirmation');

      // 11. Customer confirms completion (ORD-07)
      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/confirm-completion`)
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .expect(200);
      expect(completeRes.body.data.status).toBe('completed');

      // 12. Check status history timeline
      const histRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}/status-history`)
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .expect(200);
      expect(histRes.body.data.length).toBeGreaterThanOrEqual(4);

      // 13. Check Internal Payment Eligibility (ORD-09)
      const eligibilityRes = await request(app.getHttpServer())
        .get(`/api/v1/internal/orders/${orderId}/payment-eligibility`)
        .set('x-internal-secret', INTERNAL_SECRET)
        .expect(200);
      expect(eligibilityRes.body.data.isEligible).toBe(true);
      expect(typeof eligibilityRes.body.data.agreedPrice).toBe('string');
    });
  });

  // =========================================================================
  // 5. Dispute & Admin Resolution Lifecycle (ORD-08)
  // =========================================================================
  describe('5. Dispute Flow & Admin Operations', () => {
    it('customer opens dispute and admin resolves dispute', async () => {
      // Seed an in_progress order with valid UUID v4
      const orderId = crypto.randomUUID();
      const requestId = crypto.randomUUID();
      state.orders.set(orderId, {
        id: orderId,
        orderCode: 'ORD-DISPUTE-002',
        serviceRequestId: requestId,
        customerUserId: CUSTOMER_ID,
        workerUserId: WORKER_1_ID,
        agreedPrice: '500000',
        agreedScope: 'Sửa điện',
        addressText: 'Da Nang',
        status: 'in_progress',
        paymentState: 'unpaid',
      });

      // Customer opens dispute
      const disputeRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/dispute`)
        .set('x-user-id', CUSTOMER_ID)
        .set('x-user-roles', 'customer')
        .send({ reason: 'Thợ không đến đúng hẹn và không liên lạc được' })
        .expect(200);

      expect(disputeRes.body.data.status).toBe('disputed');

      // Admin queries all orders
      const adminListRes = await request(app.getHttpServer())
        .get('/api/v1/admin/orders')
        .set('x-user-id', ADMIN_ID)
        .set('x-user-roles', 'Admin')
        .expect(200);

      expect(adminListRes.body.data.items).toHaveLength(1);

      // Admin resolves dispute
      const resolveRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/orders/${orderId}/resolve-dispute`)
        .set('x-user-id', ADMIN_ID)
        .set('x-user-roles', 'Admin')
        .send({
          action: 'complete',
          resolutionNote: 'Đã hoàn tất sau khi trọng tài hỗ trợ đối soát',
        })
        .expect(200);

      expect(resolveRes.body.data.status).toBe('completed');
    });
  });
});
