import { randomUUID } from 'node:crypto';
import { NotificationCategory } from '@prisma/notification-client';
import {
  NOTIFICATION_EVENTS,
  type NotificationEventType,
} from '../events/event-contracts.js';
import {
  renderNotificationTemplate,
  type RecipientRole,
} from '../events/notification-templates.js';

export function resolveEventCategory(
  eventType?: string,
  explicitCategory?: NotificationCategory,
): NotificationCategory {
  if (explicitCategory) return explicitCategory;
  if (!eventType) return NotificationCategory.system;
  if (eventType.startsWith('order.')) return NotificationCategory.order;
  if (eventType.startsWith('bid.')) return NotificationCategory.bidding;
  if (eventType.startsWith('booking_proposal.'))
    return NotificationCategory.proposal;
  if (eventType.startsWith('matching.')) return NotificationCategory.matching;
  if (eventType.startsWith('payment.')) return NotificationCategory.payment;
  if (eventType.startsWith('wallet.')) return NotificationCategory.wallet;
  return NotificationCategory.system;
}

export function resolveEventTitleAndBody(params: {
  eventType: string;
  role: RecipientRole;
  explicitTitle?: string;
  explicitBody?: string;
}): { title: string; body: string } {
  const { eventType, role, explicitTitle, explicitBody } = params;
  let title = explicitTitle?.trim();
  let body = explicitBody?.trim();

  if (!title || !body) {
    if (NOTIFICATION_EVENTS.includes(eventType as NotificationEventType)) {
      const rendered = renderNotificationTemplate(
        eventType as NotificationEventType,
        role,
      );
      if (!title) title = rendered.title;
      if (!body) body = rendered.body;
    } else {
      if (!title) title = 'Thông báo từ hệ thống';
      if (!body) body = 'Bạn có thông báo mới từ hệ thống HandyGo.';
    }
  }

  return { title, body };
}

export function generateMockEventPayload(params: {
  eventType: string;
  entityId: string | null;
  requestId: string | null;
  recipientUserId: string;
  role: string;
}): Record<string, unknown> {
  const { eventType, entityId, requestId, recipientUserId, role } = params;
  const defaults: Record<string, unknown> = {};

  if (eventType.startsWith('order.')) {
    if (entityId) defaults.orderId = entityId;
    if (requestId) defaults.requestId = requestId;
    defaults.customerId = role === 'worker' ? randomUUID() : recipientUserId;
    defaults.workerId = role === 'customer' ? randomUUID() : recipientUserId;
    defaults.recipientRole = role;

    if (eventType === 'order.created') {
      defaults.status = 'CONFIRMED';
    } else if (eventType === 'order.status.changed') {
      defaults.previousStatus = 'MATCHED';
      defaults.nextStatus = 'IN_PROGRESS';
      defaults.notificationKind = 'status_update';
    } else if (eventType === 'order.cancelled') {
      defaults.previousStatus = 'CONFIRMED';
      defaults.nextStatus = 'CANCELLED';
      defaults.notificationKind = 'cancelled';
    } else if (eventType === 'order.completed') {
      defaults.previousStatus = 'IN_PROGRESS';
      defaults.nextStatus = 'COMPLETED';
      defaults.notificationKind = 'completed';
    }
  } else if (eventType.startsWith('bid.')) {
    if (entityId) defaults.bidId = entityId;
    if (requestId) defaults.requestId = requestId;
    defaults.customerId = recipientUserId;
    defaults.workerId = randomUUID();
    defaults.bidAmount = 250000;
    defaults.recipientRole = 'customer';
  } else if (eventType.startsWith('booking_proposal.')) {
    if (entityId) defaults.proposalId = entityId;
    if (requestId) defaults.requestId = requestId;
    if (eventType === 'booking_proposal.created') {
      defaults.customerId = randomUUID();
      defaults.workerId = recipientUserId;
      defaults.recipientRole = 'worker';
    } else {
      defaults.customerId = recipientUserId;
      defaults.workerId = randomUUID();
      defaults.recipientRole = 'customer';
    }
  } else if (eventType.startsWith('matching.')) {
    defaults.requestId = requestId ?? entityId ?? randomUUID();
    defaults.matchingRunId = randomUUID();
    defaults.chunkId = randomUUID();
    defaults.eligibleWorkerIds = [recipientUserId];
    defaults.recipientRole = 'worker';
  } else if (eventType.startsWith('payment.')) {
    if (entityId) defaults.paymentId = entityId;
    defaults.payerId = recipientUserId;
    defaults.amount = 350000;
    defaults.currency = 'VND';
    defaults.recipientRole = 'payer';
    if (eventType === 'payment.refunded') {
      defaults.refundId = randomUUID();
      defaults.recipientId = recipientUserId;
      defaults.recipientRole = 'recipient';
    }
  } else if (eventType.startsWith('wallet.')) {
    if (entityId) defaults.transactionId = entityId;
    defaults.walletOwnerId = recipientUserId;
    defaults.amount = 150000;
    defaults.currency = 'VND';
    defaults.recipientRole = 'owner';
  }

  return defaults;
}
