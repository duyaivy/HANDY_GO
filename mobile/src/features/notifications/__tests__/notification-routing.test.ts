import {
  getFallbackNotificationRoute,
  isRegistrationReviewEvent,
  resolveNotificationDeepLink,
} from '../notification-routing';

describe('notification-routing', () => {
  describe('isRegistrationReviewEvent', () => {
    it('returns true only for worker.service_registration approved and rejected', () => {
      expect(isRegistrationReviewEvent('worker.service_registration.approved')).toBe(true);
      expect(isRegistrationReviewEvent('worker.service_registration.rejected')).toBe(true);
      expect(isRegistrationReviewEvent('worker.service_registration.pending')).toBe(false);
      expect(isRegistrationReviewEvent('system.announcement')).toBe(false);
      expect(isRegistrationReviewEvent('')).toBe(false);
      expect(isRegistrationReviewEvent(null)).toBe(false);
    });
  });

  describe('resolveNotificationDeepLink for service registration reviews', () => {
    it('routes approved event to /worker/skills and switches mode to Worker for dual-role user in Customer mode', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'worker.service_registration.approved',
        category: 'system',
        userRoles: ['Customer', 'Worker'],
        activeMode: 'Customer',
      });

      expect(result).toEqual({
        route: '/worker/skills',
        targetMode: 'Worker',
      });
    });

    it('routes rejected event to /worker/skills without changing mode when already in Worker mode', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'worker.service_registration.rejected',
        category: 'system',
        userRoles: ['Worker'],
        activeMode: 'Worker',
      });

      expect(result).toEqual({
        route: '/worker/skills',
        targetMode: undefined,
      });
    });

    it('does NOT route to /worker/skills if user does not have Worker role', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'worker.service_registration.approved',
        category: 'system',
        userRoles: ['Customer'],
        activeMode: 'Customer',
      });

      expect(result).toBeNull();
    });

    it('does NOT route generic system notification to /worker/skills even for dual-role user', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'system.maintenance',
        category: 'system',
        userRoles: ['Customer', 'Worker'],
        activeMode: 'Customer',
      });

      expect(result).toBeNull();
    });

    it('does NOT route generic system notification to /worker/skills even when in Worker mode', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'system.announcement',
        category: 'system',
        userRoles: ['Worker'],
        activeMode: 'Worker',
      });

      expect(result).toBeNull();
    });
  });

  describe('other domain routing', () => {
    it('routes chat message.created with valid uuid conversationId', () => {
      const convId = '11111111-2222-4333-8444-555555555555';
      const result = resolveNotificationDeepLink({
        eventType: 'message.created',
        conversationId: convId,
      });
      expect(result).toEqual({ route: `/chat/${convId}` });
    });

    it('routes bid notification to customer radar and switches mode if Customer', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'bid.submitted',
        requestId: 'req-123',
        userRoles: ['Customer', 'Worker'],
        activeMode: 'Worker',
      });
      expect(result).toEqual({
        route: '/customer/booking/radar?requestId=req-123',
        targetMode: 'Customer',
      });
    });

    it('routes matching notification to worker home and switches mode if Worker', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'matching.eligible_workers.ready',
        requestId: 'req-456',
        userRoles: ['Customer', 'Worker'],
        activeMode: 'Customer',
      });
      expect(result).toEqual({
        route: '/worker?requestId=req-456',
        targetMode: 'Worker',
      });
    });

    it('routes order notification to worker jobs when in worker mode', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'order.status_updated',
        category: 'order',
        orderId: 'ord-789',
        activeMode: 'Worker',
      });
      expect(result).toEqual({ route: '/worker/jobs/ord-789' });
    });

    it('routes order notification to customer orders when in customer mode', () => {
      const result = resolveNotificationDeepLink({
        eventType: 'order.status_updated',
        category: 'order',
        orderId: 'ord-789',
        activeMode: 'Customer',
      });
      expect(result).toEqual({ route: '/customer/orders/ord-789' });
    });

    it('routes wallet notification to wallet screen according to mode', () => {
      expect(resolveNotificationDeepLink({ category: 'wallet', activeMode: 'Worker' })).toEqual({
        route: '/worker/wallet',
      });
      expect(resolveNotificationDeepLink({ category: 'payment', activeMode: 'Customer' })).toEqual({
        route: '/customer/payment',
      });
    });

    it('routes booking_proposal.created to /worker?requestId=... for Worker and switches dual-role from Customer to Worker', () => {
      expect(resolveNotificationDeepLink({
        eventType: 'booking_proposal.created',
        category: 'proposal',
        requestId: 'req-prop-1',
        recipientRole: 'worker',
        userRoles: ['Customer', 'Worker'],
        activeMode: 'Customer',
      })).toEqual({
        route: '/worker?requestId=req-prop-1',
        targetMode: 'Worker',
      });

      expect(resolveNotificationDeepLink({
        eventType: 'booking_proposal.created',
        category: 'proposal',
        userRoles: ['Worker'],
        activeMode: 'Worker',
      })).toEqual({
        route: '/worker',
        targetMode: undefined,
      });
    });

    it('routes booking_proposal.changes_requested and booking_proposal.rejected to /customer/booking/radar?requestId=... for Customer', () => {
      expect(resolveNotificationDeepLink({
        eventType: 'booking_proposal.changes_requested',
        category: 'proposal',
        requestId: 'req-prop-2',
        recipientRole: 'customer',
        userRoles: ['Customer', 'Worker'],
        activeMode: 'Worker',
      })).toEqual({
        route: '/customer/booking/radar?requestId=req-prop-2',
        targetMode: 'Customer',
      });

      expect(resolveNotificationDeepLink({
        eventType: 'booking_proposal.rejected',
        category: 'proposal',
        requestId: 'req-prop-3',
        recipientRole: 'customer',
        userRoles: ['Customer'],
        activeMode: 'Customer',
      })).toEqual({
        route: '/customer/booking/radar?requestId=req-prop-3',
        targetMode: undefined,
      });

      expect(resolveNotificationDeepLink({
        eventType: 'booking_proposal.rejected',
        category: 'proposal',
        recipientRole: 'customer',
        userRoles: ['Customer'],
        activeMode: 'Customer',
      })).toBeNull();
    });
  });

  describe('getFallbackNotificationRoute', () => {
    it('returns worker notifications for Worker mode', () => {
      expect(getFallbackNotificationRoute('Worker')).toBe('/worker/notifications');
    });

    it('returns customer notifications for Customer mode or null', () => {
      expect(getFallbackNotificationRoute('Customer')).toBe('/customer/(tabs)/notifications');
      expect(getFallbackNotificationRoute(null)).toBe('/customer/(tabs)/notifications');
    });
  });
});
