export type TrackingPhase
  = | 'DRAFT'
    | 'SEEKING_WORKERS'
    | 'BIDDING_CLOSED'
    | 'BOOKING_PROPOSAL'
    | 'ORDER_CONFIRMED'
    | 'ORDER_IN_PROGRESS'
    | 'ORDER_FINISHED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'DISPUTED';

export type MilestoneStatus = 'completed' | 'in_progress' | 'pending' | 'skipped';

export type TrackingMilestone = {
  key: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  reachedAt: string | null;
  actorUserId?: string | null;
};

export type TrackingEventItem = {
  id: string;
  eventId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  sourceService: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
  occurredAt: string;
  recordedAt: string;
  writeSequence?: number;
};

export type ServiceRequestMilestoneData = {
  status: string;
  createdAt: string;
  publishedAt?: string;
  biddingClosedAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
  convertedAt?: string;
};

export type MatchingMilestoneData = {
  status: string;
  matchCount?: number;
  completedAt?: string;
};

export type BiddingMilestoneData = {
  status: string;
  bidCount: number;
  openedAt?: string;
  closedAt?: string;
  finalizedAt?: string;
  myBid?: {
    bidId: string;
    amount?: number;
    status?: string;
  };
};

export type ProposalMilestoneData = {
  status?: string;
  proposalId?: string;
  revisionNo?: number;
  workerId?: string;
  finalizedAt?: string;
};

export type OrderMilestoneData = {
  id?: string;
  orderId?: string;
  status?: string;
  workerId?: string;
  workerUserId?: string;
  totalAmount?: number;
  createdAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  reworkReason?: string;
  disputeReason?: string;
};

export type PaymentMilestoneData = {
  status?: string;
  lastEventAt?: string;
};

export type TrackingSummaryResponse = {
  flowId?: string;
  serviceRequestId: string;
  orderId: string | null;
  customerId: string | null;
  currentPhase: TrackingPhase | string;
  milestones: TrackingMilestone[];
  serviceRequest?: ServiceRequestMilestoneData;
  matching?: MatchingMilestoneData;
  bidding?: BiddingMilestoneData;
  bookingProposal?: ProposalMilestoneData;
  order?: OrderMilestoneData;
  payment?: PaymentMilestoneData;
  totalEvents?: number;
  lastActivityAt?: string;
  lastUpdatedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TrackingTimelineResponse = {
  serviceRequestId: string;
  items: TrackingEventItem[];
  page: number;
  limit: number;
  total: number;
  totalPages?: number;
};

export type TrackingSseEventType = 'connected' | 'ping' | 'timeline_event';

export type TrackingSseMessage = {
  type: TrackingSseEventType;
  serviceRequestId?: string;
  message?: string;
  payload?: TrackingEventItem;
  timestamp?: string;
};

/**
 * Computes an ordered array of TrackingMilestones from a backend TrackingSummaryResponse.
 * Ensures the mobile UI always has a consistent array of milestones to display.
 */
export function computeMilestonesFromSummary(
  summary: Partial<TrackingSummaryResponse> & Record<string, any>,
): TrackingMilestone[] {
  if (Array.isArray(summary.milestones) && summary.milestones.length > 0) {
    return summary.milestones;
  }

  const phase = summary.currentPhase;
  const sr = summary.serviceRequest;
  const match = summary.matching;
  const bid = summary.bidding;
  const proposal = summary.bookingProposal;
  const order = summary.order;
  const payment = summary.payment;

  const milestones: TrackingMilestone[] = [];

  // 1. Service Request Milestone
  const isSrCancelled = Boolean(sr?.cancelledAt || sr?.status === 'cancelled' || phase === 'CANCELLED');
  const isSrExpired = Boolean(sr?.expiredAt || sr?.status === 'expired' || phase === 'EXPIRED');
  const isSrCompleted = Boolean(sr?.publishedAt || sr?.convertedAt || (sr?.status && sr.status !== 'draft'));

  milestones.push({
    key: 'service_request',
    title: 'Đăng yêu cầu',
    description: isSrCancelled
      ? 'Yêu cầu đã bị hủy'
      : isSrExpired
        ? 'Yêu cầu đã hết hạn'
        : isSrCompleted
          ? 'Yêu cầu dịch vụ đã được gửi thành công'
          : 'Đang tạo yêu cầu dịch vụ',
    status: isSrCancelled || isSrExpired
      ? 'skipped'
      : isSrCompleted
        ? 'completed'
        : 'in_progress',
    reachedAt: sr?.publishedAt || sr?.createdAt || summary.createdAt || null,
  });

  // 2. Matching & Bidding Milestone
  const hasProposal = Boolean(proposal?.proposalId || proposal?.finalizedAt);
  const hasOrder = Boolean(order?.orderId || order?.id || summary.orderId);
  const isBiddingActive = bid?.status === 'open' || match?.status === 'started' || phase === 'SEEKING_WORKERS';
  const isRequestBiddingClosed = sr?.status === 'bidding_closed' || phase === 'BIDDING_CLOSED';
  const isBiddingDone = isRequestBiddingClosed || hasProposal || hasOrder || bid?.status === 'closed' || bid?.status === 'finalized' || match?.status === 'completed';

  milestones.push({
    key: 'bidding',
    title: 'Tìm thợ & Báo giá',
    description: isRequestBiddingClosed && !hasProposal && !hasOrder
      ? `Đã hết thời hạn nhận báo giá (${bid?.bidCount ?? 0} báo giá)`
      : isBiddingDone
        ? `Đã nhận ${bid?.bidCount ?? 0} báo giá và chốt thợ`
        : isBiddingActive
          ? `Đang tìm thợ (${bid?.bidCount ?? 0} báo giá)`
          : 'Chờ nhận báo giá từ thợ',
    status: isBiddingDone ? 'completed' : isBiddingActive ? 'in_progress' : 'pending',
    reachedAt: bid?.finalizedAt || sr?.biddingClosedAt || bid?.closedAt || bid?.openedAt || match?.completedAt || null,
  });

  // 3. Booking Proposal Milestone
  const isProposalDone = hasOrder || proposal?.status === 'finalized';
  const isProposalActive = phase === 'BOOKING_PROPOSAL' || Boolean(proposal?.status && proposal.status !== 'pending');

  milestones.push({
    key: 'booking_proposal',
    title: 'Thỏa thuận dịch vụ',
    description: isProposalDone
      ? 'Đã thống nhất phương án và chi phí'
      : isProposalActive
        ? 'Đang thỏa thuận chi tiết với thợ'
        : 'Chờ xác nhận thỏa thuận',
    status: isProposalDone ? 'completed' : isProposalActive ? 'in_progress' : 'pending',
    reachedAt: proposal?.finalizedAt || null,
  });

  // 4. Order Execution Milestone
  const orderStatus = order?.status;
  const isOrderCompleted = orderStatus === 'completed' || phase === 'COMPLETED' || phase === 'ORDER_FINISHED';
  const isOrderDisputed = orderStatus === 'disputed' || phase === 'DISPUTED';
  const isOrderActive = hasOrder && (orderStatus === 'in_progress' || orderStatus === 'confirmed' || phase === 'ORDER_IN_PROGRESS' || phase === 'ORDER_CONFIRMED');

  milestones.push({
    key: 'order_execution',
    title: 'Thực hiện dịch vụ',
    description: isOrderDisputed
      ? `Đang có tranh chấp: ${order?.disputeReason || 'Cần hỗ trợ'}`
      : isOrderCompleted
        ? 'Thợ đã hoàn thành công việc'
        : isOrderActive
          ? (order?.reworkReason ? `Đang làm lại: ${order.reworkReason}` : 'Thợ đang tiến hành thực hiện')
          : 'Chờ thợ bắt đầu công việc',
    status: isOrderCompleted ? 'completed' : (isOrderActive || isOrderDisputed) ? 'in_progress' : 'pending',
    reachedAt: order?.completedAt || order?.createdAt || null,
  });

  // 5. Payment & Finalization Milestone
  const isPaymentCompleted = payment?.status === 'succeeded' || phase === 'COMPLETED';
  const isPaymentPending = phase === 'ORDER_FINISHED' || payment?.status === 'pending';

  milestones.push({
    key: 'payment_completion',
    title: 'Nghiệm thu & Thanh toán',
    description: isPaymentCompleted
      ? 'Đã thanh toán và hoàn tất dịch vụ'
      : isPaymentPending
        ? 'Chờ khách hàng nghiệm thu và thanh toán'
        : 'Thanh toán sau khi hoàn thành',
    status: isPaymentCompleted ? 'completed' : isPaymentPending ? 'in_progress' : 'pending',
    reachedAt: payment?.lastEventAt || null,
  });

  return milestones;
}
