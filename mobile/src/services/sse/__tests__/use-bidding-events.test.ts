import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import * as React from 'react';
import { AppState } from 'react-native';
import { candidateQueryKeys, workerBiddingKeys } from '@/features/candidates/hooks/candidate-query-keys';
import {
  getActiveSseConnection,
  terminateAllBiddingSseConnections,
  useBiddingEvents,
} from '../use-bidding-events';

// Mock BiddingSseClient
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockListeners: Record<string, Set<(data: any) => void>> = {};

jest.mock('../bidding-sse-client', () => {
  return {
    BiddingSseClient: jest.fn().mockImplementation((requestId: string) => {
      return {
        requestId,
        connect: mockConnect,
        disconnect: mockDisconnect,
        getIsOpen: jest.fn(() => true),
        on: jest.fn((event: string, cb: (data: any) => void) => {
          if (!mockListeners[event]) {
            mockListeners[event] = new Set();
          }
          mockListeners[event].add(cb);
          return () => mockListeners[event]?.delete(cb);
        }),
      };
    }),
  };
});

// Mock AuthStore
let mockAuthState = {
  isAuthenticated: true,
  user: { id: 'user-111', roles: ['Customer'] },
};

jest.mock('@/stores/use-auth-store', () => {
  return {
    useAuthStore: Object.assign(
      jest.fn((selector?: (state: any) => any) => {
        return selector ? selector(mockAuthState) : mockAuthState;
      }),
      {
        getState: jest.fn(() => mockAuthState),
        subscribe: jest.fn(),
      },
    ),
  };
});

describe('useBiddingEvents Hook Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    terminateAllBiddingSseConnections();
    Object.keys(mockListeners).forEach(k => delete mockListeners[k]);
    mockAuthState = {
      isAuthenticated: true,
      user: { id: 'user-111', roles: ['Customer'] },
    };

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    jest.spyOn(queryClient, 'invalidateQueries');
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it('reads connection state from the transport on open, close and disabled subscriptions', () => {
    const view = renderHook<ReturnType<typeof useBiddingEvents>, { enabled: boolean }>(({ enabled }) => useBiddingEvents('req-status', { enabled }), { wrapper, initialProps: { enabled: true } });
    const client = getActiveSseConnection('req-status')!;
    expect(view.result.current.isConnected).toBe(true);
    jest.mocked(client.getIsOpen).mockReturnValue(false);
    act(() => mockListeners.close.forEach(listener => listener(undefined)));
    expect(view.result.current.isConnected).toBe(false);
    jest.mocked(client.getIsOpen).mockReturnValue(true);
    act(() => mockListeners.open.forEach(listener => listener(undefined)));
    expect(view.result.current.isConnected).toBe(true);
    view.rerender({ enabled: false });
    expect(view.result.current.isConnected).toBe(false);
    view.unmount();
  });

  it('enforces a single active connection per request ID when multiple components mount', () => {
    const requestId = 'req-shared-123';

    // First hook mount
    const { unmount: unmount1 } = renderHook(() => useBiddingEvents(requestId), { wrapper });
    expect(mockConnect).toHaveBeenCalledTimes(1);
    const clientInstance1 = getActiveSseConnection(requestId);
    expect(clientInstance1).toBeDefined();

    // Second hook mount with the exact same requestId
    const { unmount: unmount2 } = renderHook(() => useBiddingEvents(requestId), { wrapper });
    // Should NOT create another connection
    expect(mockConnect).toHaveBeenCalledTimes(1);
    const clientInstance2 = getActiveSseConnection(requestId);
    expect(clientInstance2).toBe(clientInstance1);

    // Unmount first component -> connection remains active for second component
    unmount1();
    expect(mockDisconnect).not.toHaveBeenCalled();

    // Unmount second component -> connection disconnects
    unmount2();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(getActiveSseConnection(requestId)).toBeUndefined();
  });

  it('invalidates candidate and worker query keys upon real-time events', () => {
    const requestId = 'req-invalidation';
    const onBidChanged = jest.fn();

    renderHook(() => useBiddingEvents(requestId, { onBidChanged }), { wrapper });

    // 1. Trigger ready event
    act(() => {
      mockListeners.ready?.forEach(cb => cb({ requestId, connectedAt: '2026-10-28T00:00:00Z', heartbeatIntervalMs: 15000 }));
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: candidateQueryKeys.byRequest(requestId),
    });

    // 2. Trigger bid.changed event
    const bidEvent = { eventId: 'ev-1', requestId, kind: 'submitted' as const, occurredAt: '2026-10-28T00:01:00Z' };
    act(() => {
      mockListeners['bid.changed']?.forEach(cb => cb(bidEvent));
    });
    expect(onBidChanged).toHaveBeenCalledWith(bidEvent);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: candidateQueryKeys.byRequest(requestId),
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: workerBiddingKeys.requestBids(requestId),
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['worker-bidding', 'my-bids'],
    });
  });

  it('disconnects on background AppState and reconnects/reconciles on active AppState', () => {
    const requestId = 'req-lifecycle';
    let appStateCallback: (state: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event: any, handler: any) => {
      appStateCallback = handler;
      return { remove: jest.fn() } as any;
    });

    // Remount to capture AppState listener
    const { unmount } = renderHook(() => useBiddingEvents(requestId), { wrapper });

    // Transition to background
    act(() => {
      appStateCallback('background');
    });
    expect(mockDisconnect).toHaveBeenCalled();

    // Return to active foreground
    act(() => {
      appStateCallback('active');
    });
    expect(mockConnect).toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: candidateQueryKeys.byRequest(requestId),
    });

    unmount();
  });

  it('terminates all connections when terminateAllBiddingSseConnections is invoked', () => {
    const requestId1 = 'req-1';
    const requestId2 = 'req-2';

    renderHook(() => useBiddingEvents(requestId1), { wrapper });
    renderHook(() => useBiddingEvents(requestId2), { wrapper });

    expect(getActiveSseConnection(requestId1)).toBeDefined();
    expect(getActiveSseConnection(requestId2)).toBeDefined();

    terminateAllBiddingSseConnections();

    expect(getActiveSseConnection(requestId1)).toBeUndefined();
    expect(getActiveSseConnection(requestId2)).toBeUndefined();
    expect(mockDisconnect).toHaveBeenCalled();
  });
  it('repairs a silent broker gap via sync.required without another business event and retries REST failure', async () => {
    jest.useFakeTimers();
    let serverBids = ['old'];
    let fail = false;
    const key = candidateQueryKeys.candidatesList('req-recovery');
    const queryFn = async () => {
      if (fail)
        throw new Error('REST temporarily unavailable');
      return serverBids;
    };
    await queryClient.fetchQuery({ queryKey: key, queryFn });
    const observer = new QueryObserver(queryClient, { queryKey: key, queryFn });
    const unsubscribe = observer.subscribe(() => {});
    const { unmount } = renderHook(() => useBiddingEvents('req-recovery'), { wrapper });
    serverBids = ['old', 'new-during-outage'];
    fail = true;
    await act(async () => {
      mockListeners['sync.required'].forEach(cb => cb({ requestId: 'req-recovery', reason: 'bridge.ready' }));
    });
    expect(queryClient.getQueryData(key)).toEqual(['old']);
    fail = false;
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(queryClient.getQueryData(key)).toEqual(serverBids);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    unmount();
    unsubscribe();
    queryClient.clear();
    jest.useRealTimers();
  });

  it('shares one repair loop, ignores foreign requests, stops on background/logout and replaces account stream', async () => {
    jest.useFakeTimers();
    let appStateCallback: (state: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event: any, handler: any) => {
      appStateCallback = handler;
      return { remove: jest.fn() } as any;
    });
    const view = renderHook(() => useBiddingEvents('req-shared'), { wrapper });
    const { unmount: unmountSecond } = renderHook(() => useBiddingEvents('req-shared'), { wrapper });
    expect(mockListeners['sync.required'].size).toBe(1);
    act(() => mockListeners['sync.required'].forEach(cb => cb({ requestId: 'foreign' })));
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    act(() => appStateCallback('background'));
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    await act(async () => appStateCallback('active'));
    expect(queryClient.invalidateQueries).toHaveBeenCalled();
    mockAuthState = { ...mockAuthState, user: { id: 'new-user', roles: ['Customer'] } };
    view.rerender({});
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalledTimes(3);
    act(() => terminateAllBiddingSseConnections());
    jest.mocked(queryClient.invalidateQueries).mockClear();
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    view.unmount();
    unmountSecond();
    jest.useRealTimers();
  });
});
