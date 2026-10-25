import { Injectable } from '@nestjs/common';
import type { NotificationCategory } from '@prisma/notification-client';
import type {
  NotificationEvent,
  NotificationEventType,
} from './event-contracts.js';
import type { RecipientRole } from './notification-templates.js';

export interface Recipient {
  userId: string;
  role: RecipientRole;
}
export interface NotificationRoute {
  category: NotificationCategory;
  entityId: string;
  requestId?: string;
  recipients: Recipient[];
}
type StrategyMap = {
  [K in NotificationEventType]: (
    event: Extract<NotificationEvent, { eventType: K }>,
  ) => NotificationRoute;
};
const customerOrder = (data: {
  customerId: string;
  workerId: string;
}): Recipient[] => [
  { userId: data.customerId, role: 'customer' },
  { userId: data.workerId, role: 'worker' },
];
const strategies: StrategyMap = {
  'matching.eligible_workers.ready': ({ data }) => ({
    category: 'matching',
    entityId: data.requestId,
    requestId: data.requestId,
    recipients: data.eligibleWorkerIds.map((userId) => ({
      userId,
      role: 'worker',
    })),
  }),
  'bid.submitted': ({ data }) => ({
    category: 'bidding',
    entityId: data.bidId,
    requestId: data.requestId,
    recipients: [{ userId: data.customerId, role: 'customer' }],
  }),
  'bid.revised': ({ data }) => ({
    category: 'bidding',
    entityId: data.bidId,
    requestId: data.requestId,
    recipients: [{ userId: data.customerId, role: 'customer' }],
  }),
  'booking_proposal.created': ({ data }) => ({
    category: 'proposal',
    entityId: data.proposalId,
    requestId: data.requestId,
    recipients: [{ userId: data.workerId, role: 'worker' }],
  }),
  'booking_proposal.changes_requested': ({ data }) => ({
    category: 'proposal',
    entityId: data.proposalId,
    requestId: data.requestId,
    recipients: [{ userId: data.customerId, role: 'customer' }],
  }),
  'booking_proposal.rejected': ({ data }) => ({
    category: 'proposal',
    entityId: data.proposalId,
    requestId: data.requestId,
    recipients: [{ userId: data.customerId, role: 'customer' }],
  }),
  'order.created': ({ data }) => ({
    category: 'order',
    entityId: data.orderId,
    recipients: customerOrder(data),
  }),
  'order.status.changed': ({ data }) => ({
    category: 'order',
    entityId: data.orderId,
    recipients: customerOrder(data),
  }),
  'order.cancelled': ({ data }) => ({
    category: 'order',
    entityId: data.orderId,
    recipients: customerOrder(data),
  }),
  'order.completed': ({ data }) => ({
    category: 'order',
    entityId: data.orderId,
    recipients: customerOrder(data),
  }),
  'payment.succeeded': ({ data }) => ({
    category: 'payment',
    entityId: data.paymentId,
    recipients: [{ userId: data.payerId, role: 'payer' }],
  }),
  'payment.failed': ({ data }) => ({
    category: 'payment',
    entityId: data.paymentId,
    recipients: [{ userId: data.payerId, role: 'payer' }],
  }),
  'payment.refunded': ({ data }) => ({
    category: 'payment',
    entityId: data.refundId,
    recipients: [{ userId: data.recipientId, role: 'recipient' }],
  }),
  'wallet.credited': ({ data }) => ({
    category: 'wallet',
    entityId: data.transactionId,
    recipients: [{ userId: data.walletOwnerId, role: 'owner' }],
  }),
  'wallet.debited': ({ data }) => ({
    category: 'wallet',
    entityId: data.transactionId,
    recipients: [{ userId: data.walletOwnerId, role: 'owner' }],
  }),
  'wallet.balance.adjusted': ({ data }) => ({
    category: 'wallet',
    entityId: data.transactionId,
    recipients: [{ userId: data.walletOwnerId, role: 'owner' }],
  }),
};

@Injectable()
export class NotificationRouter {
  resolve(event: NotificationEvent): NotificationRoute {
    // The discriminator selects the corresponding typed strategy.
    const strategy = strategies[event.eventType] as (
      event: NotificationEvent,
    ) => NotificationRoute;
    return strategy(event);
  }
}
