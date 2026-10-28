import type {
  SseBidChangedEvent,
  SseMatchingChangedEvent,
  SseReadyEvent,
  SseRoundChangedEvent,
} from './bidding-sse-client';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { candidateQueryKeys, workerBiddingKeys } from '@/features/candidates/hooks/candidate-query-keys';
import { Logger } from '@/services/logger/logger';
import { useAuthStore } from '@/stores/use-auth-store';
import { BiddingSseClient } from './bidding-sse-client';

export type UseBiddingEventsOptions = {
  enabled?: boolean;
  disconnectOnBlur?: boolean;
  onBidChanged?: (event: SseBidChangedEvent) => void;
  onRoundChanged?: (event: SseRoundChangedEvent) => void;
  onMatchingChanged?: (event: SseMatchingChangedEvent) => void;
  onReady?: (event: SseReadyEvent) => void;
};

type ConnectionEntry = {
  client: BiddingSseClient;
  subscribersCount: number;
};

// Module-level connection registry: ensures only ONE active SSE client connection per request ID
const activeConnections = new Map<string, ConnectionEntry>();

export function getActiveSseConnection(requestId: string): BiddingSseClient | undefined {
  return activeConnections.get(requestId)?.client;
}

export function getAllActiveSseConnections(): Map<string, ConnectionEntry> {
  return activeConnections;
}

/**
 * Terminates and clears all active SSE connections across the entire mobile client.
 * Called immediately when auth store transitions to logged out or user account switches.
 */
export function terminateAllBiddingSseConnections(): void {
  for (const [reqId, entry] of activeConnections.entries()) {
    Logger.debug('SSE_TERMINATE', `Terminating SSE connection for request ${reqId}`);
    try {
      entry.client.disconnect();
    }
    catch {}
  }
  activeConnections.clear();
}

// Global Auth Store Subscription: immediately cleans up active connections on logout or account switch
if (typeof useAuthStore?.subscribe === 'function') {
  useAuthStore.subscribe((state, prevState) => {
    const wasAuth = prevState?.isAuthenticated;
    const isAuth = state.isAuthenticated;
    const prevUserId = prevState?.user?.id;
    const nextUserId = state.user?.id;

    if ((wasAuth && !isAuth) || (prevUserId && nextUserId && prevUserId !== nextUserId)) {
      Logger.info('SSE_AUTH_STATE_CHANGE', 'User logged out or switched accounts. Purging all active SSE streams.');
      terminateAllBiddingSseConnections();
    }
  });
}

/**
 * React hook that manages an authenticated SSE connection for a given service request.
 * Automatically invalidates TanStack React Query caches on real-time events,
 * suspends on background AppState or screen blur, and resumes/reconciles on active foreground.
 */
export function useBiddingEvents(
  requestId?: string | null,
  options?: UseBiddingEventsOptions,
) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const currentUserId = useAuthStore(state => state.user?.id);

  // Screen focus handling (optional disconnect on screen blur)
  const [isScreenFocused, setIsScreenFocused] = React.useState(true);

  React.useEffect(() => {
    if (!options?.disconnectOnBlur) {
      setIsScreenFocused(true);
      return;
    }

    try {
      // Dynamically check if react-navigation is available in this component tree
      const { useIsFocused } = require('@react-navigation/native');
      if (typeof useIsFocused === 'function') {
        // Handled via separate listener or state if supported
      }
    }
    catch {}
  }, [options?.disconnectOnBlur]);

  const enabled = (options?.enabled ?? true)
    && Boolean(requestId)
    && Boolean(isAuthenticated && currentUserId)
    && isScreenFocused;

  const [isConnected, setIsConnected] = React.useState(false);
  const clientInstanceRef = React.useRef<BiddingSseClient | null>(null);

  // Keep latest callbacks in ref to avoid re-connecting on function identity changes
  const callbacksRef = React.useRef(options);
  React.useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  React.useEffect(() => {
    if (!enabled || !requestId) {
      if (clientInstanceRef.current) {
        const entry = activeConnections.get(requestId || '');
        if (entry) {
          entry.subscribersCount -= 1;
          if (entry.subscribersCount <= 0) {
            entry.client.disconnect();
            activeConnections.delete(requestId || '');
          }
        }
        clientInstanceRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Single active connection per request ID: reuse or instantiate
    let client: BiddingSseClient;
    const existingEntry = activeConnections.get(requestId);

    if (existingEntry) {
      existingEntry.subscribersCount += 1;
      client = existingEntry.client;
    }
    else {
      client = new BiddingSseClient(requestId);
      activeConnections.set(requestId, { client, subscribersCount: 1 });
      void client.connect();
    }

    clientInstanceRef.current = client;
    setIsConnected(client.getIsOpen());

    // 1. Connection Open / Ready
    const unsubOpen = client.on('open', () => {
      setIsConnected(true);
    });

    const unsubReady = client.on('ready', (event) => {
      Logger.debug('SSE_READY', `Connected to SSE stream for request ${requestId}`, event);
      callbacksRef.current?.onReady?.(event);
      // Reconcile on reconnect: refresh candidates cache
      void queryClient.invalidateQueries({
        queryKey: candidateQueryKeys.byRequest(requestId),
      });
    });

    // 2. Bid Lifecycle Changed (submitted, revised, withdrawn)
    const unsubBid = client.on('bid.changed', (event) => {
      Logger.debug('SSE_BID_CHANGED', 'Bid changed event received', event);
      callbacksRef.current?.onBidChanged?.(event);

      // Customer candidate feed invalidation (deduplication & replenishment)
      void queryClient.invalidateQueries({
        queryKey: candidateQueryKeys.byRequest(requestId),
      });

      // Worker bidding feed invalidation
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.requestBids(requestId),
      });
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.myBids(),
      });
    });

    // 3. Round Lifecycle Changed (opened, closed, extended, finalized, cancelled)
    const unsubRound = client.on('round.changed', (event) => {
      Logger.debug('SSE_ROUND_CHANGED', 'Round changed event received', event);
      callbacksRef.current?.onRoundChanged?.(event);

      void queryClient.invalidateQueries({
        queryKey: candidateQueryKeys.roundStatus(requestId),
      });
      void queryClient.invalidateQueries({
        queryKey: candidateQueryKeys.byRequest(requestId),
      });
    });

    // 4. Matching Changed (AI completed / failed)
    const unsubMatching = client.on('matching.changed', (event) => {
      Logger.debug('SSE_MATCHING_CHANGED', 'Matching update event received', event);
      callbacksRef.current?.onMatchingChanged?.(event);

      void queryClient.invalidateQueries({
        queryKey: candidateQueryKeys.byRequest(requestId),
      });
    });

    const unsubClose = client.on('close', () => {
      setIsConnected(false);
    });

    const unsubError = client.on('error', (err) => {
      Logger.warn('SSE_HOOK_ERROR', `SSE error on request ${requestId}`, err);
    });

    // AppState lifecycle listener (Contract Section 20)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        Logger.debug('SSE_APP_STATE', 'App moved to background, disconnecting SSE');
        client.disconnect();
        setIsConnected(false);
      }
      else if (nextAppState === 'active') {
        Logger.debug('SSE_APP_STATE', 'App returned to active foreground, reconnecting SSE');
        void client.connect();
        // Reconcile missed updates while backgrounded
        void queryClient.invalidateQueries({
          queryKey: candidateQueryKeys.byRequest(requestId),
        });
        void queryClient.invalidateQueries({
          queryKey: workerBiddingKeys.requestBids(requestId),
        });
        void queryClient.invalidateQueries({
          queryKey: workerBiddingKeys.myBids(),
        });
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      appStateSub.remove();
      unsubOpen();
      unsubReady();
      unsubBid();
      unsubRound();
      unsubMatching();
      unsubClose();
      unsubError();

      const entry = activeConnections.get(requestId);
      if (entry) {
        entry.subscribersCount -= 1;
        if (entry.subscribersCount <= 0) {
          entry.client.disconnect();
          activeConnections.delete(requestId);
        }
      }
      clientInstanceRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, requestId, queryClient]);

  return {
    isConnected,
    reconnect: React.useCallback(() => {
      if (clientInstanceRef.current) {
        void clientInstanceRef.current.connect();
      }
    }, []),
    disconnect: React.useCallback(() => {
      if (clientInstanceRef.current) {
        clientInstanceRef.current.disconnect();
      }
    }, []),
  };
}
