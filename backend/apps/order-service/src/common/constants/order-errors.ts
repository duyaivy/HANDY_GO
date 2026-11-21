export const ORDER_ERROR_CODES = {
  // 400 Bad Request
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  DEADLINE_EXPIRED: 'DEADLINE_EXPIRED',
  MISSING_EVIDENCE: 'MISSING_EVIDENCE',
  DISPUTE_REASON_REQUIRED: 'DISPUTE_REASON_REQUIRED',
  COMPLAINT_WINDOW_EXPIRED: 'COMPLAINT_WINDOW_EXPIRED',
  REWORK_REASON_REQUIRED: 'REWORK_REASON_REQUIRED',
  CANCEL_REASON_REQUIRED: 'CANCEL_REASON_REQUIRED',
  RESOLUTION_REASON_REQUIRED: 'RESOLUTION_REASON_REQUIRED',
  LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION: 'LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION',
  REFUND_AMOUNT_EXCEEDS_REFUNDABLE: 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE',
  TOO_EARLY_TO_START: 'TOO_EARLY_TO_START',

  // 403 Forbidden
  NOT_ORDER_OWNER: 'NOT_ORDER_OWNER',
  DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION:
    'DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION',
  NOT_REQUEST_OWNER: 'NOT_REQUEST_OWNER',
  NOT_PROPOSAL_PARTICIPANT: 'NOT_PROPOSAL_PARTICIPANT',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  REFUND_SELF_APPROVAL_FORBIDDEN: 'REFUND_SELF_APPROVAL_FORBIDDEN',

  // 404 Not Found
  SERVICE_REQUEST_NOT_FOUND: 'SERVICE_REQUEST_NOT_FOUND',
  PROPOSAL_NOT_FOUND: 'PROPOSAL_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  EVIDENCE_NOT_FOUND: 'EVIDENCE_NOT_FOUND',
  MEDIA_NOT_FOUND: 'MEDIA_NOT_FOUND',

  // 409 Conflict
  ORDER_ALREADY_EXISTS: 'ORDER_ALREADY_EXISTS',
  PROPOSAL_ALREADY_FINALIZED: 'PROPOSAL_ALREADY_FINALIZED',
  PROPOSAL_REVISION_CONFLICT: 'PROPOSAL_REVISION_CONFLICT',
  REQUEST_ALREADY_CONVERTED: 'REQUEST_ALREADY_CONVERTED',
  WORKER_CAPACITY_EXCEEDED: 'WORKER_CAPACITY_EXCEEDED',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
  WORKER_ALREADY_BUSY: 'WORKER_ALREADY_BUSY',
  DISPUTE_ALREADY_DECIDED: 'DISPUTE_ALREADY_DECIDED',
  PAYMENT_NOT_REFUNDABLE: 'PAYMENT_NOT_REFUNDABLE',

  // 422 Unprocessable Entity
  INCOMPLETE_PUBLISH_PAYLOAD: 'INCOMPLETE_PUBLISH_PAYLOAD',

  // 503 Service Unavailable
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type OrderErrorCode =
  (typeof ORDER_ERROR_CODES)[keyof typeof ORDER_ERROR_CODES];

export const ORDER_ERROR_MESSAGES: Record<OrderErrorCode, string> = {
  INVALID_STATE_TRANSITION:
    'Invalid state transition requested for this resource',
  DEADLINE_EXPIRED:
    'The operational deadline has passed for this resource',
  MISSING_EVIDENCE:
    'At least one proof of work image or video evidence is required before finishing the order',
  DISPUTE_REASON_REQUIRED:
    'A dispute reason is strictly required to open a dispute',
  COMPLAINT_WINDOW_EXPIRED:
    'Đã quá thời hạn 7 ngày kể từ khi hoàn tất đơn hàng, không thể mở khiếu nại.',
  REWORK_REASON_REQUIRED:
    'A rework reason is required when requesting rework',
  CANCEL_REASON_REQUIRED:
    'A reason is required when cancelling the order',
  RESOLUTION_REASON_REQUIRED:
    'An admin resolution reason is required to resolve a dispute',
  LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION: 'Legacy actions cannot resolve a completed-order dispute',
  REFUND_AMOUNT_EXCEEDS_REFUNDABLE: 'Refund amount exceeds the remaining refundable amount',
  TOO_EARLY_TO_START:
    'Chưa tới giờ hẹn! Bạn chỉ có thể bấm bắt đầu trước giờ hẹn tối đa 30 phút.',

  NOT_ORDER_OWNER:
    'You are not authorized to access or modify this order',
  DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION:
    'Chỉ khách hàng của đơn hàng mới có quyền mở khiếu nại sau khi đơn đã hoàn tất.',
  NOT_REQUEST_OWNER:
    'You are not authorized to modify this service request',
  NOT_PROPOSAL_PARTICIPANT:
    'You are not a participant in this booking proposal',
  FORBIDDEN_ROLE:
    'You do not have the required role to perform this action',
  REFUND_SELF_APPROVAL_FORBIDDEN:
    'An Admin cannot approve a refund for their own payment',

  SERVICE_REQUEST_NOT_FOUND:
    'The requested service request could not be found',
  PROPOSAL_NOT_FOUND:
    'The requested booking proposal could not be found',
  ORDER_NOT_FOUND:
    'The requested order could not be found',
  EVIDENCE_NOT_FOUND:
    'The requested order evidence could not be found',
  MEDIA_NOT_FOUND:
    'The requested service request media could not be found',

  ORDER_ALREADY_EXISTS:
    'An order has already been finalized for this service request',
  PROPOSAL_ALREADY_FINALIZED:
    'This booking proposal has already been finalized',
  PROPOSAL_REVISION_CONFLICT:
    'A newer revision of this proposal already exists',
  REQUEST_ALREADY_CONVERTED:
    'This service request has already been converted to an order',
  WORKER_CAPACITY_EXCEEDED:
    'Bạn đang có 3 đơn hàng chưa hoàn thành. Vui lòng hoàn thành các đơn hiện tại trước khi nhận thêm đơn mới!',
  SCHEDULE_CONFLICT:
    'Lịch hẹn bị trùng hoặc khoảng cách giữa các đơn nhỏ hơn 60 phút.',
  WORKER_ALREADY_BUSY:
    'Bạn đang thi công một đơn khác. Vui lòng hoàn thành đơn hiện tại trước khi bắt đầu đơn mới!',
  DISPUTE_ALREADY_DECIDED: 'This dispute already has an Admin decision',
  PAYMENT_NOT_REFUNDABLE: 'Payment is not settled or has no refundable balance',

  INCOMPLETE_PUBLISH_PAYLOAD:
    'Service request must include serviceId, addressText, coordinates, description, and future scheduledAt to be published',
  SERVICE_UNAVAILABLE:
    'External downstream service is temporarily unavailable',
};
