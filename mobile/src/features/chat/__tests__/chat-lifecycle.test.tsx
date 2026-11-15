import { act, render } from '@testing-library/react-native';
import { queryClient } from '@/lib/api/query-client';
import { ChatLifecycle } from '../chat-lifecycle';

const mockEvents = new Map<string, () => void>();
let mockConnection: (() => void) | undefined;
let mockUserId = 'customer';
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: mockUserId } }),
}));
jest.mock('@/lib/api/query-client', () => ({ queryClient: {
  invalidateQueries: jest.fn(),
  cancelQueries: jest.fn(),
  removeQueries: jest.fn(),
} }));
jest.mock('../chat-socket', () => ({ chatSocket: {
  start: jest.fn(),
  stop: jest.fn(),
  clear: jest.fn(),
  connected: () => true,
  subscribe: jest.fn((event, callback) => {
    mockEvents.set(event, callback);
    return () => mockEvents.delete(event);
  }),
  onConnection: jest.fn((callback) => {
    mockConnection = callback;
    return () => {
      mockConnection = undefined;
    };
  }),
} }));
it('updates the current inbox on socket messages and reconnect without push and detaches on account switch', () => {
  const view = render(<ChatLifecycle />);
  expect(mockEvents.has('message.new')).toBe(true);
  act(() => {
    mockEvents.get('message.new')!();
  });
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'customer', 'list'] });
  jest.clearAllMocks();
  act(() => {
    mockConnection!();
  });
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'customer', 'list'] });
  mockUserId = 'worker';
  view.rerender(<ChatLifecycle />);
  jest.clearAllMocks();
  act(() => {
    mockEvents.get('message.new')!();
  });
  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['chat', 'worker', 'list'] });
  expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['chat', 'customer', 'list'] });
  view.unmount();
  expect(mockEvents.size).toBe(0);
  expect(mockConnection).toBeUndefined();
});
