import { io } from 'socket.io-client';
import { chatSocket } from '../chat-socket';

const mockListeners = new Map<string, (...args: unknown[]) => unknown>();
const mockSocket = {
  connected: true,
  connect: jest.fn(),
  disconnect: jest.fn(),
  removeAllListeners: jest.fn(),
  on: jest.fn((name, listener) => mockListeners.set(name, listener)),
  off: jest.fn(),
  emit: jest.fn(),
};
jest.mock('../chat-config', () => ({ resolveChatBaseUrl: () => 'http://127.0.0.1:3000/api/v1' }));
jest.mock('socket.io-client', () => ({ io: jest.fn(() => mockSocket) }));
jest.mock('@/lib/auth/utils', () => ({
  getToken: () => ({ access: 'access-token' }),
}));
jest.mock('@/services/api/api-client', () => ({
  resolveApiBaseUrl: () => 'http://127.0.0.1:3000/api/v1',
  refreshTokens: jest.fn(),
}));
afterEach(() => {
  chatSocket.clear();
  jest.clearAllMocks();
  mockListeners.clear();
});
it('uses one authenticated socket and removes only the requested listener', () => {
  const listener = jest.fn();
  const dispose = chatSocket.subscribe('message.new', listener);
  chatSocket.start();
  expect(io).toHaveBeenCalledTimes(1);
  expect(io).toHaveBeenCalledWith(
    'http://127.0.0.1:3000',
    expect.objectContaining({
      path: '/api/v1/chat/socket.io/',
      autoConnect: false,
    }),
  );
  const options = (io as jest.Mock).mock.calls[0][1];
  const auth = jest.fn();
  options.auth(auth);
  expect(auth).toHaveBeenCalledWith({ token: 'access-token' });
  dispose();
  expect(mockSocket.off).toHaveBeenCalledWith('message.new', listener);
});
it('preserves the idempotency key through retry and resolves only a persisted ACK', async () => {
  chatSocket.start();
  const input = {
    conversationId: 'conversation',
    clientMessageId: 'stable-key',
    messageType: 'TEXT',
    content: 'Hello',
  };
  mockSocket.emit.mockImplementation((_event, _input, ack) =>
    ack({
      ok: false,
      error: {
        code: 'ELIGIBILITY_UNAVAILABLE',
        retryable: true,
        message: 'Unavailable',
      },
    }),
  );
  await expect(chatSocket.request('message.send', input)).rejects.toMatchObject(
    { code: 'ELIGIBILITY_UNAVAILABLE' },
  );
  mockSocket.emit.mockImplementation((_event, _input, ack) =>
    ack({ ok: true, data: { message: { id: 'persisted' }, duplicate: true } }),
  );
  await expect(
    chatSocket.request('message.send', input),
  ).resolves.toMatchObject({ duplicate: true });
  expect(mockSocket.emit.mock.calls.map(call => call[1])).toEqual([
    input,
    input,
  ]);
});
it('disconnects and drops transport listeners when session ends', () => {
  chatSocket.start();
  chatSocket.clear();
  expect(mockSocket.disconnect).toHaveBeenCalled();
  expect(mockSocket.removeAllListeners).toHaveBeenCalled();
});
