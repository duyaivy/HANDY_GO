export const ORDER_CONSTANTS = {
  // Deadline configurations
  DEFAULT_BIDDING_DURATION_HOURS: 24,
  DEFAULT_SELECTION_DURATION_HOURS: 24,
  TOTAL_EXPIRATION_DURATION_HOURS: 48,

  // Trusted Gateway Headers
  HEADER_INTERNAL_SECRET: 'x-internal-secret',
  HEADER_USER_ID: 'x-user-id',
  HEADER_USER_ROLES: 'x-user-roles',

  // Outbox Aggregates
  AGGREGATE_SERVICE_REQUEST: 'ServiceRequest',
  AGGREGATE_ORDER: 'Order',
  AGGREGATE_BOOKING_PROPOSAL: 'BookingProposal',

  // Outbox Event Types (Outbound)
  EVENT_SERVICE_REQUEST_PUBLISHED: 'service_request.published',
  EVENT_SERVICE_REQUEST_BIDDING_CLOSED: 'service_request.bidding_closed',
  EVENT_SERVICE_REQUEST_EXPIRED: 'service_request.expired',
  EVENT_SERVICE_REQUEST_CANCELLED: 'service_request.cancelled',
  EVENT_BOOKING_PROPOSAL_CREATED: 'booking_proposal.created',
  EVENT_BOOKING_PROPOSAL_CHANGES_REQUESTED:
    'booking_proposal.changes_requested',
  EVENT_BOOKING_PROPOSAL_REJECTED: 'booking_proposal.rejected',
  EVENT_ORDER_CREATED: 'order.created',
  EVENT_ORDER_STATUS_CHANGED: 'order.status.changed',
  EVENT_ORDER_CONFIRMED: 'order.confirmed',
  EVENT_ORDER_STARTED: 'order.started',
  EVENT_ORDER_FINISHED: 'order.finished',
  EVENT_ORDER_COMPLETED: 'order.completed',
  EVENT_ORDER_CANCELLED: 'order.cancelled',
  EVENT_ORDER_DISPUTED: 'order.disputed',

  // Inbound Event Types
  EVENT_PAYMENT_SUCCEEDED: 'payment.succeeded',
  EVENT_PAYMENT_FAILED: 'payment.failed',

  // Exchange
  RABBITMQ_EXCHANGE: 'handy-go.events',
} as const;
