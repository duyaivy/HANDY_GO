import type { TrackingConnectionStatus } from '@/services/sse/tracking-sse-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement } from 'react';
import { useTrackingEvents } from '../hooks/use-tracking-events';

let mockStatus: (status: TrackingConnectionStatus) => void;
let mockEventHandler: (event: any) => void;
const mockDisconnect = jest.fn();
const mockUnsubscribe = jest.fn();
const mockInvalidateOrderRelatedQueries = jest.fn();

jest.mock('@/features/orders/hooks/orders-query-keys', () => ({
  invalidateOrderRelatedQueries: (...args: any[]) => mockInvalidateOrderRelatedQueries(...args),
}));

jest.mock('@/services/sse/tracking-sse-client', () => ({
  TrackingSseClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(async () => undefined),
    disconnect: mockDisconnect,
    onEvent: (listener: typeof mockEventHandler) => {
      mockEventHandler = listener;
      return mockUnsubscribe;
    },
    onStatusChange: (listener: typeof mockStatus) => {
      mockStatus = listener;
      return mockUnsubscribe;
    },
  })),
}));

it('reports disconnected immediately when the request is removed and releases the stream', () => {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const { result, rerender, unmount } = renderHook(({ id }: { id?: string }) => useTrackingEvents(id), { wrapper, initialProps: { id: 'request-1' } });
  act(() => mockStatus('connected'));
  expect(result.current.connectionStatus).toBe('connected');
  rerender({ id: undefined });
  expect(result.current.connectionStatus).toBe('disconnected');
  expect(mockDisconnect).toHaveBeenCalledTimes(1);
  expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
  unmount();
  client.clear();
});

it('triggers immediate and staggered retry invalidations on order.* SSE events', () => {
  jest.useFakeTimers();
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const { unmount } = renderHook(({ id }: { id?: string }) => useTrackingEvents(id), { wrapper, initialProps: { id: 'request-1' } });

  act(() => {
    mockEventHandler({ eventType: 'order.completed' });
  });

  // Immediate invalidation
  expect(mockInvalidateOrderRelatedQueries).toHaveBeenCalledTimes(1);

  // Staggered retry invalidation after 1200ms
  act(() => {
    jest.advanceTimersByTime(1200);
  });
  expect(mockInvalidateOrderRelatedQueries).toHaveBeenCalledTimes(2);

  unmount();
  client.clear();
  jest.useRealTimers();
});
