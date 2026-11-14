/** Payloads written to the Order outbox and read by Tracking. */
export interface OrderCreatedPayload {
  orderId: string;
  orderCode: string;
  serviceRequestId: string;
  requestId: string;
  bookingProposalId: string;
  customerUserId: string;
  customerId: string;
  workerUserId: string;
  workerId: string;
  selectionSource: 'bid' | 'recommendation';
  selectedBidId: string | null;
  selectedMatchResultId: string | null;
  serviceId: string;
  agreedPrice: string;
  currency: 'VND';
  scheduledAt: string | null;
  addressText: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  customerId: string;
  customerUserId: string;
  workerId: string;
  workerUserId: string;
  previousStatus: string;
  nextStatus: string;
  notificationKind: string;
  confirmedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  reason?: string;
  reworkReason?: string;
  disputeReason?: string;
}

export interface ServiceRequestBiddingClosedPayload {
  serviceRequestId: string;
  requestId: string;
  requestCode: string;
  customerUserId: string;
  biddingClosedAt: string;
}
