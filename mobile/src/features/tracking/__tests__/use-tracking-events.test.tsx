import type { TrackingConnectionStatus } from '@/services/sse/tracking-sse-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement } from 'react';
import { useTrackingEvents } from '../hooks/use-tracking-events';

let mockStatus: (status: TrackingConnectionStatus) => void;
const mockDisconnect = jest.fn();
const mockUnsubscribe = jest.fn();
jest.mock('@/services/sse/tracking-sse-client', () => ({
  TrackingSseClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(async () => undefined),
    disconnect: mockDisconnect,
    onEvent: () => mockUnsubscribe,
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
