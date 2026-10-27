export const ORDER_ERROR_CODES = {
  // 400 Bad Request
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  DEADLINE_EXPIRED: 'DEADLINE_EXPIRED',
  MISSING_EVIDENCE: 'MISSING_EVIDENCE',
  DISPUTE_REASON_REQUIRED: 'DISPUTE_REASON_REQUIRED',
  REWORK_REASON_REQUIRED: 'REWORK_REASON_REQUIRED',
  CANCEL_REASON_REQUIRED: 'CANCEL_REASON_REQUIRED',
  RESOLUTION_REASON_REQUIRED: 'RESOLUTION_REASON_REQUIRED',

  // 403 Forbidden
  NOT_ORDER_OWNER: 'NOT_ORDER_OWNER',
  NOT_REQUEST_OWNER: 'NOT_REQUEST_OWNER',
  NOT_PROPOSAL_PARTICIPANT: 'NOT_PROPOSAL_PARTICIPANT',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',

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

  // 422 Unprocessable Entity
  INCOMPLETE_PUBLISH_PAYLOAD: 'INCOMPLETE_PUBLISH_PAYLOAD',
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
  REWORK_REASON_REQUIRED:
    'A rework reason is required when requesting rework',
  CANCEL_REASON_REQUIRED:
    'A reason is required when cancelling the order',
  RESOLUTION_REASON_REQUIRED:
    'An admin resolution reason is required to resolve a dispute',

  NOT_ORDER_OWNER:
    'You are not authorized to access or modify this order',
  NOT_REQUEST_OWNER:
    'You are not authorized to modify this service request',
  NOT_PROPOSAL_PARTICIPANT:
    'You are not a participant in this booking proposal',
  FORBIDDEN_ROLE:
    'You do not have the required role to perform this action',

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

  INCOMPLETE_PUBLISH_PAYLOAD:
    'Service request must include serviceId, addressText, coordinates, description, and future scheduledAt to be published',
};
