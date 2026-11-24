export type NotificationRouteTarget = {
  route: string;
  targetMode?: 'Customer' | 'Worker';
};

export type NotificationRoutingParams = {
  eventType?: string | null;
  category?: string | null;
  requestId?: string | null;
  orderId?: string | null;
  conversationId?: string | null;
  recipientRole?: string | null;
  userRoles?: string[];
  activeMode?: 'Customer' | 'Worker' | null;
  isWorkerContext?: boolean;
};

export function isRegistrationReviewEvent(eventType?: string | null): boolean {
  return (
    eventType === 'worker.service_registration.approved'
    || eventType === 'worker.service_registration.rejected'
  );
}

export function resolveNotificationDeepLink(
  params: NotificationRoutingParams,
): NotificationRouteTarget | null {
  const {
    eventType = '',
    category = '',
    requestId = '',
    orderId = '',
    conversationId = '',
    recipientRole = '',
    userRoles = [],
    activeMode = null,
    isWorkerContext = false,
  } = params;

  const effectiveWorker = isWorkerContext || activeMode === 'Worker';

  // 1. Chat: message.created or chat category with a valid UUID conversationId
  if (
    (eventType === 'message.created' || category === 'chat')
    && conversationId
    && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(conversationId)
  ) {
    return { route: `/chat/${conversationId}` };
  }

  // 2. Worker Service Registration review:
  // Strictly only approved or rejected events AND user has Worker role
  if (isRegistrationReviewEvent(eventType) && userRoles.includes('Worker')) {
    return {
      route: '/worker/skills',
      targetMode: activeMode !== 'Worker' ? 'Worker' : undefined,
    };
  }

  // 3. Customer Bidding / Radar
  if (
    (eventType === 'bid.submitted' || eventType === 'bid.revised' || category === 'bidding')
    && requestId
  ) {
    return {
      route: `/customer/booking/radar?requestId=${encodeURIComponent(requestId)}`,
      targetMode: userRoles.includes('Customer') && activeMode !== 'Customer' ? 'Customer' : undefined,
    };
  }

  // 4. Worker Matching / Job Discovery
  if (
    eventType === 'matching.eligible_workers.ready'
    || (category === 'matching' && (activeMode === 'Worker' || userRoles.includes('Worker')))
  ) {
    return {
      route: requestId ? `/worker?requestId=${encodeURIComponent(requestId)}` : '/worker',
      targetMode: userRoles.includes('Worker') && activeMode !== 'Worker' ? 'Worker' : undefined,
    };
  }

  // 4b. Booking Proposal (booking_proposal.created -> Worker; changes_requested/rejected -> Customer)
  if (
    eventType === 'booking_proposal.created'
    || eventType === 'booking_proposal.changes_requested'
    || eventType === 'booking_proposal.rejected'
    || category === 'proposal'
  ) {
    const normalizedRecipientRole = String(recipientRole || '').toLowerCase();
    const isWorkerProposal = normalizedRecipientRole === 'worker' || eventType === 'booking_proposal.created';
    const isCustomerProposal = normalizedRecipientRole === 'customer'
      || eventType === 'booking_proposal.changes_requested'
      || eventType === 'booking_proposal.rejected';

    if (isWorkerProposal) {
      if (userRoles.includes('Worker') || effectiveWorker) {
        return {
          route: requestId ? `/worker?requestId=${encodeURIComponent(requestId)}` : '/worker',
          targetMode: userRoles.includes('Worker') && activeMode !== 'Worker' ? 'Worker' : undefined,
        };
      }
      return null;
    }

    if (isCustomerProposal) {
      if (!requestId) {
        return null;
      }
      return {
        route: `/customer/booking/radar?requestId=${encodeURIComponent(requestId)}`,
        targetMode: userRoles.includes('Customer') && activeMode !== 'Customer' ? 'Customer' : undefined,
      };
    }

    if (effectiveWorker) {
      return {
        route: requestId ? `/worker?requestId=${encodeURIComponent(requestId)}` : '/worker',
      };
    }
    if (requestId) {
      return {
        route: `/customer/booking/radar?requestId=${encodeURIComponent(requestId)}`,
      };
    }
    return null;
  }

  // 5. Orders (order.* or category order)
  if (orderId && (category === 'order' || (eventType && eventType.startsWith('order.')))) {
    return {
      route: effectiveWorker
        ? `/worker/jobs/${encodeURIComponent(orderId)}`
        : `/customer/orders/${encodeURIComponent(orderId)}`,
    };
  }

  // 6. Wallet / Payment
  if (category === 'wallet' || category === 'payment') {
    return {
      route: effectiveWorker ? '/worker/wallet' : '/customer/payment',
    };
  }

  // Generic notifications (including generic system notifications) do NOT switch mode or open worker skills
  return null;
}

export function getFallbackNotificationRoute(activeMode?: 'Customer' | 'Worker' | null): string {
  return activeMode === 'Worker' ? '/worker/notifications' : '/customer/(tabs)/notifications';
}
