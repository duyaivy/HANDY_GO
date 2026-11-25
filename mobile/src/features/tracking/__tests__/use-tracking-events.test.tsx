import type { TrackingConnectionStatus } from '@/services/sse/tracking-sse-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement } from 'react';
import { useTrackingEvents } from '../hooks/use-tracking-events';

let mockStatus: (status: TrackingConnectionStatus) => void;
let mockEventHandler: (event: any) => void;
const mockDisconnect = jest.fn();
const mockUnsubscribe = jest.fn();

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

afterEach(() => {
  jest.useRealTimers();
});

it('triggers immediate and staggered retry invalidations (> 1.2s) even after unmount on order.* SSE events', () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  const client = new QueryClient();
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const { unmount } = renderHook(({ id }: { id?: string }) => useTrackingEvents(id), { wrapper, initialProps: { id: 'request-1' } });

  act(() => {
    mockEventHandler({ eventType: 'order.completed' });
  });

  // Immediate invalidation includes worker-skills-orders and worker-public-profile-services
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worker-skills-orders'] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['worker-public-profile-services'] });
  const initialCallCount = invalidateSpy.mock.calls.length;

  // Unmount right after event (e.g. user navigates away immediately after confirming)
  unmount();

  // Staggered retries at 1000ms, 2500ms, and 5000ms still run (covers consumer > 1.2s)
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(invalidateSpy.mock.calls.length).toBeGreaterThan(initialCallCount);
  const after1sCount = invalidateSpy.mock.calls.length;

  act(() => {
    jest.advanceTimersByTime(1500); // total 2500ms
  });
  expect(invalidateSpy.mock.calls.length).toBeGreaterThan(after1sCount);
  const after2_5sCount = invalidateSpy.mock.calls.length;

  act(() => {
    jest.advanceTimersByTime(2500); // total 5000ms
  });
  expect(invalidateSpy.mock.calls.length).toBeGreaterThan(after2_5sCount);

  client.clear();
  jest.useRealTimers();
});
