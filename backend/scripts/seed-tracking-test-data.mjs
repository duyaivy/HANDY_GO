import pg from 'pg';
import crypto from 'node:crypto';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const SCENARIOS = [
  {
    name: '1. Giai đoạn Đang Đấu Giá (OPEN_FOR_BIDDING)',
    serviceRequestId: '11111111-1111-4000-8000-000000000001',
    orderId: null,
    customerId: null, // Cho phép mọi token test đều query được
    events: [
      {
        entityType: 'service_request',
        eventType: 'service_request.created',
        sourceService: 'order-service',
        fromStatus: null,
        toStatus: 'draft',
        metadata: { title: 'Sửa bồn rửa bát bị rò rỉ', address: 'Quận Hải Châu, Đà Nẵng' },
        offsetMinutes: -60,
      },
      {
        entityType: 'service_request',
        eventType: 'service_request.published',
        sourceService: 'order-service',
        fromStatus: 'draft',
        toStatus: 'open_for_bidding',
        metadata: { aiPriceRange: '200,000 - 350,000 VND' },
        offsetMinutes: -55,
      },
      {
        entityType: 'matching',
        eventType: 'matching.started',
        sourceService: 'matching-service',
        offsetMinutes: -50,
      },
      {
        entityType: 'matching',
        eventType: 'matching.completed',
        sourceService: 'matching-service',
        metadata: { matchCount: 5, matchedRadiusKm: 5 },
        offsetMinutes: -48,
      },
      {
        entityType: 'bidding_round',
        eventType: 'bidding.round.opened',
        sourceService: 'bidding-service',
        metadata: { roundNumber: 1, durationMinutes: 120 },
        offsetMinutes: -45,
      },
      {
        entityType: 'bid',
        entityId: 'bbbbbbbb-1111-4000-8000-000000000001',
        eventType: 'bid.submitted',
        sourceService: 'bidding-service',
        actorUserId: '1377604f-84e3-46d7-bae2-0c1c862bd021', // Thợ Tuấn
        metadata: { workerId: '1377604f-84e3-46d7-bae2-0c1c862bd021', amount: 250000, note: 'Có mặt sau 20 phút' },
        offsetMinutes: -30,
      },
      {
        entityType: 'bid',
        entityId: 'bbbbbbbb-2222-4000-8000-000000000002',
        eventType: 'bid.submitted',
        sourceService: 'bidding-service',
        actorUserId: 'edb2595e-38e2-4694-a39e-a4ab6cacc0ef', // Thợ đối thủ
        metadata: { workerId: 'edb2595e-38e2-4694-a39e-a4ab6cacc0ef', amount: 280000, note: 'Bảo hành 3 tháng' },
        offsetMinutes: -15,
      },
    ],
  },
  {
    name: '2. Giai đoạn Đang Thương Lượng Báo Giá (PROPOSAL_NEGOTIATION)',
    serviceRequestId: '22222222-2222-4000-8000-000000000002',
    orderId: null,
    customerId: null,
    events: [
      {
        entityType: 'service_request',
        eventType: 'service_request.created',
        sourceService: 'order-service',
        offsetMinutes: -120,
      },
      {
        entityType: 'service_request',
        eventType: 'service_request.published',
        sourceService: 'order-service',
        offsetMinutes: -115,
      },
      {
        entityType: 'bidding_round',
        eventType: 'bidding.round.opened',
        sourceService: 'bidding-service',
        offsetMinutes: -110,
      },
      {
        entityType: 'bid',
        eventType: 'bid.submitted',
        sourceService: 'bidding-service',
        actorUserId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
        metadata: { workerId: '1377604f-84e3-46d7-bae2-0c1c862bd021', amount: 300000 },
        offsetMinutes: -90,
      },
      {
        entityType: 'bidding_round',
        eventType: 'bidding.round.closed',
        sourceService: 'bidding-service',
        offsetMinutes: -60,
      },
      {
        entityType: 'bidding_round',
        eventType: 'bidding.round.finalized',
        sourceService: 'bidding-service',
        metadata: { selectedWorkerId: '1377604f-84e3-46d7-bae2-0c1c862bd021' },
        offsetMinutes: -55,
      },
      {
        entityType: 'booking_proposal',
        eventType: 'booking_proposal.created',
        sourceService: 'order-service',
        actorUserId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
        metadata: {
          workerId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
          revisionNo: 1,
          totalPrice: 450000,
          items: [{ name: 'Thay vòi nước inox 304', price: 350000 }, { name: 'Công thợ', price: 100000 }],
        },
        offsetMinutes: -40,
      },
      {
        entityType: 'booking_proposal',
        eventType: 'booking_proposal.changes_requested',
        sourceService: 'order-service',
        reason: 'Khách hàng yêu cầu đổi sang vòi đồng và chỉnh giờ hẹn lúc 14:00',
        metadata: { revisionNo: 1 },
        offsetMinutes: -25,
      },
      {
        entityType: 'booking_proposal',
        eventType: 'booking_proposal.created',
        sourceService: 'order-service',
        actorUserId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
        metadata: {
          workerId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
          revisionNo: 2,
          totalPrice: 420000,
          scheduledTime: '14:00 02/11/2026',
        },
        offsetMinutes: -10,
      },
    ],
  },
  {
    name: '3. Giai đoạn Đơn Hàng Đang Thực Hiện (ORDER_IN_PROGRESS)',
    serviceRequestId: '33333333-3333-4000-8000-000000000003',
    orderId: '33333333-aaaa-4000-8000-000000000003',
    customerId: null,
    events: [
      {
        entityType: 'service_request',
        eventType: 'service_request.created',
        sourceService: 'order-service',
        offsetMinutes: -180,
      },
      {
        entityType: 'booking_proposal',
        eventType: 'booking_proposal.finalized',
        sourceService: 'order-service',
        actorUserId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
        metadata: { workerId: '1377604f-84e3-46d7-bae2-0c1c862bd021', finalizedPrice: 400000 },
        offsetMinutes: -120,
      },
      {
        entityType: 'service_request',
        eventType: 'service_request.converted_to_order',
        sourceService: 'order-service',
        offsetMinutes: -118,
      },
      {
        entityType: 'order',
        eventType: 'order.created',
        sourceService: 'order-service',
        fromStatus: null,
        toStatus: 'created',
        metadata: { orderCode: 'ORD-TEST-003', totalAmount: 400000 },
        offsetMinutes: -115,
      },
      {
        entityType: 'order',
        eventType: 'order.status_changed',
        sourceService: 'order-service',
        fromStatus: 'created',
        toStatus: 'in_progress',
        actorUserId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
        reason: 'Thợ đã đến hiện trường và đang tiến hành sửa chữa ống nước',
        offsetMinutes: -30,
      },
    ],
  },
  {
    name: '4. Giai đoạn Hoàn Thành Toàn Bộ (COMPLETED)',
    serviceRequestId: '44444444-4444-4000-8000-000000000004',
    orderId: '44444444-aaaa-4000-8000-000000000004',
    customerId: null,
    events: [
      {
        entityType: 'service_request',
        eventType: 'service_request.created',
        sourceService: 'order-service',
        offsetMinutes: -300,
      },
      {
        entityType: 'service_request',
        eventType: 'service_request.published',
        sourceService: 'order-service',
        offsetMinutes: -290,
      },
      {
        entityType: 'service_request',
        eventType: 'service_request.converted_to_order',
        sourceService: 'order-service',
        offsetMinutes: -200,
      },
      {
        entityType: 'order',
        eventType: 'order.created',
        sourceService: 'order-service',
        toStatus: 'created',
        offsetMinutes: -195,
      },
      {
        entityType: 'order',
        eventType: 'order.status_changed',
        sourceService: 'order-service',
        fromStatus: 'created',
        toStatus: 'in_progress',
        offsetMinutes: -120,
      },
      {
        entityType: 'order',
        eventType: 'order.completed',
        sourceService: 'order-service',
        fromStatus: 'in_progress',
        toStatus: 'completed',
        reason: 'Công việc hoàn thành tốt, khách hàng đã nghiệm thu',
        offsetMinutes: -30,
      },
      {
        entityType: 'payment',
        eventType: 'payment.initiated',
        sourceService: 'payment-service',
        metadata: { method: 'VNPAY', amount: 500000 },
        offsetMinutes: -25,
      },
      {
        entityType: 'payment',
        eventType: 'payment.succeeded',
        sourceService: 'payment-service',
        metadata: { transactionId: 'TXN-99882233', amount: 500000 },
        offsetMinutes: -20,
      },
    ],
  },
  {
    name: '5. Giai đoạn Đã Bị Hủy (CANCELLED)',
    serviceRequestId: '55555555-5555-4000-8000-000000000005',
    orderId: null,
    customerId: null,
    events: [
      {
        entityType: 'service_request',
        eventType: 'service_request.created',
        sourceService: 'order-service',
        offsetMinutes: -100,
      },
      {
        entityType: 'service_request',
        eventType: 'service_request.published',
        sourceService: 'order-service',
        offsetMinutes: -90,
      },
      {
        entityType: 'service_request',
        eventType: 'service_request.cancelled',
        sourceService: 'order-service',
        fromStatus: 'open_for_bidding',
        toStatus: 'cancelled',
        reason: 'Khách hàng tự xử lý được sự cố nên yêu cầu hủy đơn',
        offsetMinutes: -10,
      },
    ],
  },
];

async function seed() {
  console.log('🚀 Bắt đầu tạo dữ liệu kiểm thử cho Tracking Service...');

  for (const s of SCENARIOS) {
    console.log(`\n▶ Đang tạo: [${s.name}]`);
    console.log(`  - serviceRequestId: ${s.serviceRequestId}`);

    // Upsert trackingFlow
    const flowRes = await pool.query(
      `
      INSERT INTO tracking_service.tracking_flows (id, service_request_id, order_id, customer_id, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
      ON CONFLICT (service_request_id) 
      DO UPDATE SET order_id = EXCLUDED.order_id, customer_id = EXCLUDED.customer_id, updated_at = NOW()
      RETURNING id;
      `,
      [s.serviceRequestId, s.orderId, s.customerId]
    );

    const flowId = flowRes.rows[0].id;

    // Xóa events cũ nếu có để re-seed chuẩn xác
    await pool.query(
      `DELETE FROM tracking_service.tracking_events WHERE tracking_flow_id = $1`,
      [flowId]
    );

    // Thêm các events theo trình tự thời gian
    const now = Date.now();
    for (const evt of s.events) {
      const occurredAt = new Date(now + (evt.offsetMinutes || 0) * 60 * 1000);
      const eventId = crypto.randomUUID();
      const entityId = evt.entityId || (evt.entityType === 'order' && s.orderId ? s.orderId : s.serviceRequestId);

      await pool.query(
        `
        INSERT INTO tracking_service.tracking_events (
          id, tracking_flow_id, event_id, entity_type, entity_id, event_type, 
          source_service, from_status, to_status, actor_user_id, reason, metadata, occurred_at, recorded_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
        )
        `,
        [
          flowId,
          eventId,
          evt.entityType,
          entityId,
          evt.eventType,
          evt.sourceService || 'order-service',
          evt.fromStatus || null,
          evt.toStatus || null,
          evt.actorUserId || null,
          evt.reason || null,
          evt.metadata ? JSON.stringify(evt.metadata) : null,
          occurredAt,
        ]
      );
    }

    console.log(`  ✓ Đã chèn ${s.events.length} sự kiện tracking!`);
  }

  console.log('\n======================================================');
  console.log('✅ ĐÃ HOÀN TẤT TẠO DỮ LIỆU KIỂM THỬ TRACKING!');
  console.log('======================================================\n');
  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Lỗi khi seed tracking test data:', err);
  pool.end();
  process.exit(1);
});
