import { describe, it, expect } from 'vitest';
import { PushPayloadBuilder } from './push-payload.builder.js';
import { FCM_MAX_PAYLOAD_BYTES } from './push.constants.js';

describe('PushPayloadBuilder', () => {
  it('builds a standard notification payload with whitelisted data', () => {
    const payload = PushPayloadBuilder.build({
      notificationId: 'notif-123',
      title: 'Đơn hàng mới',
      body: 'Bạn có yêu cầu dịch vụ mới từ khách hàng',
      eventType: 'order.created',
      category: 'order',
      sourceEntityId: 'order-456',
      serviceRequestId: 'req-789',
      recipientRole: 'worker',
      customData: {
        extraMeta: 'info-1',
        nested: { a: 1 },
      },
    });

    expect(payload.title).toBe('Đơn hàng mới');
    expect(payload.body).toBe('Bạn có yêu cầu dịch vụ mới từ khách hàng');
    expect(payload.data.notificationId).toBe('notif-123');
    expect(payload.data.eventType).toBe('order.created');
    expect(payload.data.category).toBe('order');
    expect(payload.data.entityId).toBe('order-456');
    expect(payload.data.requestId).toBe('req-789');
    expect(payload.data.recipientRole).toBe('worker');
    expect(payload.data.extraMeta).toBe('info-1');
    expect(payload.data.nested).toBe('{"a":1}');
  });

  it('rejects FCM reserved keys from customData', () => {
    const payload = PushPayloadBuilder.build({
      notificationId: 'notif-123',
      title: 'Title',
      body: 'Body',
      customData: {
        from: 'spoofed-sender',
        notification: 'bad-key',
        collapse_key: 'ck',
        safe_key: 'allowed',
      },
    });

    expect(payload.data.from).toBeUndefined();
    expect(payload.data.notification).toBeUndefined();
    expect(payload.data.collapse_key).toBeUndefined();
    expect(payload.data.safe_key).toBe('allowed');
  });

  it('truncates oversized body to stay within FCM 4096 bytes limit', () => {
    const hugeBody = 'B'.repeat(5000);
    const payload = PushPayloadBuilder.build({
      notificationId: 'notif-123',
      title: 'Long Title',
      body: hugeBody,
      eventType: 'order.created',
    });

    const totalBytes =
      Buffer.byteLength(payload.title, 'utf8') +
      Buffer.byteLength(payload.body, 'utf8') +
      Object.entries(payload.data).reduce(
        (acc, [k, v]) => acc + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v, 'utf8'),
        0,
      );

    expect(totalBytes).toBeLessThanOrEqual(FCM_MAX_PAYLOAD_BYTES);
    expect(payload.body.endsWith('...')).toBe(true);
  });

  it('rejects google.* and gcm.* prefixed keys from customData', () => {
    const payload = PushPayloadBuilder.build({
      notificationId: 'notif-123',
      title: 'Title',
      body: 'Body',
      customData: {
        'google.bad': 'not-allowed',
        'gcm.notification.alert': 'blocked',
        'gcm_custom': 'blocked',
        valid_custom: 'ok',
      },
    });

    expect(payload.data['google.bad']).toBeUndefined();
    expect(payload.data['gcm.notification.alert']).toBeUndefined();
    expect(payload.data['gcm_custom']).toBeUndefined();
    expect(payload.data.valid_custom).toBe('ok');
  });

  it('guarantees <= 4096 bytes when customData is huge and body is short', () => {
    const payload = PushPayloadBuilder.build({
      notificationId: 'notif-123',
      title: 'Title',
      body: 'Short',
      customData: {
        large: 'X'.repeat(5000),
      },
    });

    const totalBytes =
      Buffer.byteLength(payload.title, 'utf8') +
      Buffer.byteLength(payload.body, 'utf8') +
      Object.entries(payload.data).reduce(
        (acc, [k, v]) => acc + Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v, 'utf8'),
        0,
      );

    expect(totalBytes).toBeLessThanOrEqual(FCM_MAX_PAYLOAD_BYTES);
  });
});
