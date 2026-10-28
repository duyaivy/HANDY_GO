import {
  BiddingSseClient,
  calculateBackoffDelay,
  SseStreamParser,
} from '../bidding-sse-client';

// Mock dependencies
const mockGetToken = jest.fn(() => ({ access: 'mock-access-token', refresh: 'mock-refresh-token' }));
jest.mock('@/lib/auth/utils', () => ({
  getToken: () => mockGetToken(),
}));

const mockRefreshTokens = jest.fn().mockResolvedValue('mock-new-access-token');
jest.mock('@/services/api/api-client', () => ({
  resolveApiBaseUrl: jest.fn(() => 'http://127.0.0.1:3000/api/v1'),
  refreshTokens: () => mockRefreshTokens(),
}));

jest.mock('@/services/logger/logger', () => ({
  Logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Bidding SSE Client & Parser Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetToken.mockReturnValue({ access: 'mock-access-token', refresh: 'mock-refresh-token' });
    mockRefreshTokens.mockResolvedValue('mock-new-access-token');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('calculateBackoffDelay', () => {
    it('should return approximately 1000ms for attempt 0 with jitter (+/- 20%)', () => {
      const delay = calculateBackoffDelay(0, 30000);
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(1200);
    });

    it('should return approximately 2000ms for attempt 1 with jitter', () => {
      const delay = calculateBackoffDelay(1, 30000);
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    });

    it('should cap backoff delay at maxBackoffMs', () => {
      const delay = calculateBackoffDelay(10, 30000);
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });

  describe('SseStreamParser', () => {
    it('should parse standard event and data block', () => {
      const parser = new SseStreamParser();
      const onEvent = jest.fn();
      parser.onEvent = onEvent;

      const rawChunk = 'event: ready\ndata: {"requestId":"req-123","connectedAt":"2026-10-28T00:00:00Z"}\n\n';
      parser.feed(rawChunk);

      expect(onEvent).toHaveBeenCalledWith(
        'ready',
        '{"requestId":"req-123","connectedAt":"2026-10-28T00:00:00Z"}',
      );
    });

    it('should invoke onComment when receiving keepalive lines starting with colon', () => {
      const parser = new SseStreamParser();
      const onComment = jest.fn();
      parser.onComment = onComment;

      const rawChunk = ':keepalive 2026-10-28T12:00:00.000Z\n\n';
      parser.feed(rawChunk);

      expect(onComment).toHaveBeenCalledWith('keepalive 2026-10-28T12:00:00.000Z');
    });

    it('should assemble fragmented chunks across multiple feed calls', () => {
      const parser = new SseStreamParser();
      const onEvent = jest.fn();
      parser.onEvent = onEvent;

      // First chunk is incomplete
      parser.feed('event: bid.changed\nda');
      expect(onEvent).not.toHaveBeenCalled();

      // Second chunk completes the data line and double newline
      parser.feed('ta: {"kind":"submitted"}\n\n');
      expect(onEvent).toHaveBeenCalledWith('bid.changed', '{"kind":"submitted"}');
    });

    it('should parse multi-line data blocks', () => {
      const parser = new SseStreamParser();
      const onEvent = jest.fn();
      parser.onEvent = onEvent;

      parser.feed('event: test.event\ndata: {"part1": 1,\ndata: "part2": 2}\n\n');
      expect(onEvent).toHaveBeenCalledWith('test.event', '{"part1": 1,\n"part2": 2}');
    });

    it('should reset buffer correctly', () => {
      const parser = new SseStreamParser();
      const onEvent = jest.fn();
      parser.onEvent = onEvent;

      parser.feed('event: partial');
      parser.reset();
      parser.feed('event: ready\ndata: {}\n\n');

      expect(onEvent).toHaveBeenCalledWith('ready', '{}');
    });
  });

  describe('BiddingSseClient Fetch Transport (Web)', () => {
    it('should connect, stream events via fetch readable stream and dispatch to listeners', async () => {
      const requestId = 'req-abc-123';
      const client = new BiddingSseClient(requestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        heartbeatTimeoutMs: 10000,
        transport: 'fetch',
      });

      const readyCallback = jest.fn();
      const bidChangedCallback = jest.fn();
      const roundChangedCallback = jest.fn();
      const openCallback = jest.fn();

      client.on('ready', readyCallback);
      client.on('bid.changed', bidChangedCallback);
      client.on('round.changed', roundChangedCallback);
      client.on('open', openCallback);

      // Mock fetch with a readable stream
      const chunks = [
        new TextEncoder().encode('event: ready\ndata: {"requestId":"req-abc-123","connectedAt":"2026-10-28T00:00:00Z","heartbeatIntervalMs":15000}\n\n'),
        new TextEncoder().encode('event: bid.changed\ndata: {"eventId":"e1","requestId":"req-abc-123","kind":"submitted","occurredAt":"2026-10-28T00:01:00Z"}\n\n'),
        new TextEncoder().encode('event: round.changed\ndata: {"eventId":"e2","requestId":"req-abc-123","kind":"extended","occurredAt":"2026-10-28T00:02:00Z"}\n\n'),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            return Promise.resolve({ done: false, value: chunks[chunkIndex++] });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader,
        },
      } as any);

      await client.connect();

      expect(openCallback).toHaveBeenCalled();
      expect(readyCallback).toHaveBeenCalledWith({
        requestId: 'req-abc-123',
        connectedAt: '2026-10-28T00:00:00Z',
        heartbeatIntervalMs: 15000,
      });
      expect(bidChangedCallback).toHaveBeenCalledWith({
        eventId: 'e1',
        requestId: 'req-abc-123',
        kind: 'submitted',
        occurredAt: '2026-10-28T00:01:00Z',
      });
      expect(roundChangedCallback).toHaveBeenCalledWith({
        eventId: 'e2',
        requestId: 'req-abc-123',
        kind: 'extended',
        occurredAt: '2026-10-28T00:02:00Z',
      });

      client.disconnect();
    });

    it('should refresh token on fetch 401 Unauthorized response', async () => {
      const requestId = 'req-401';
      const client = new BiddingSseClient(requestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        transport: 'fetch',
      });

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: () => Promise.resolve({ done: true, value: undefined }),
            }),
          },
        });
      });

      await client.connect();

      expect(mockRefreshTokens).toHaveBeenCalled();
      client.disconnect();
    });
  });

  describe('BiddingSseClient XMLHttpRequest Transport (React Native MOB-FIX-01)', () => {
    let mockXhrInstances: any[] = [];

    beforeEach(() => {
      mockXhrInstances = [];
      (global as any).XMLHttpRequest = jest.fn().mockImplementation(() => {
        const instance: any = {
          open: jest.fn(),
          setRequestHeader: jest.fn(),
          send: jest.fn(),
          abort: jest.fn(),
          readyState: 0,
          status: 0,
          responseText: '',
          onreadystatechange: null,
          onprogress: null,
          onload: null,
          onerror: null,
        };
        mockXhrInstances.push(instance);
        return instance;
      });
    });

    it('should stream chunks incrementally using xhr.onprogress and xhr.responseText slice', async () => {
      const requestId = 'req-xhr-1';
      const client = new BiddingSseClient(requestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        transport: 'xhr',
      });

      const openCallback = jest.fn();
      const readyCallback = jest.fn();
      const bidChangedCallback = jest.fn();

      client.on('open', openCallback);
      client.on('ready', readyCallback);
      client.on('bid.changed', bidChangedCallback);

      await client.connect();

      expect(mockXhrInstances.length).toBe(1);
      const xhr = mockXhrInstances[0];

      expect(xhr.open).toHaveBeenCalledWith('GET', 'http://127.0.0.1:3000/api/v1/bids/requests/req-xhr-1/events', true);
      expect(xhr.setRequestHeader).toHaveBeenCalledWith('Accept', 'text/event-stream');
      expect(xhr.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer mock-access-token');
      expect(xhr.send).toHaveBeenCalled();

      // 1. Headers received (status 200)
      xhr.readyState = 2;
      xhr.status = 200;
      xhr.onreadystatechange?.();
      expect(openCallback).toHaveBeenCalled();

      // 2. First progress chunk: ready event
      xhr.responseText = 'event: ready\ndata: {"requestId":"req-xhr-1","connectedAt":"2026-10-28T00:00:00Z","heartbeatIntervalMs":15000}\n\n';
      xhr.onprogress?.();
      expect(readyCallback).toHaveBeenCalledWith({
        requestId: 'req-xhr-1',
        connectedAt: '2026-10-28T00:00:00Z',
        heartbeatIntervalMs: 15000,
      });

      // 3. Second progress chunk: bid.changed event (accumulated in responseText)
      xhr.responseText += 'event: bid.changed\ndata: {"eventId":"e-100","requestId":"req-xhr-1","kind":"submitted","occurredAt":"2026-10-28T00:05:00Z"}\n\n';
      xhr.onprogress?.();
      expect(bidChangedCallback).toHaveBeenCalledWith({
        eventId: 'e-100',
        requestId: 'req-xhr-1',
        kind: 'submitted',
        occurredAt: '2026-10-28T00:05:00Z',
      });

      client.disconnect();
      expect(xhr.abort).toHaveBeenCalled();
    });

    it('should refresh token on XHR 401 and reconnect immediately', async () => {
      const requestId = 'req-xhr-401';
      const client = new BiddingSseClient(requestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        transport: 'xhr',
      });

      await client.connect();
      expect(mockXhrInstances.length).toBe(1);
      const xhr = mockXhrInstances[0];

      // Simulate 401
      xhr.readyState = 2;
      xhr.status = 401;
      xhr.onreadystatechange?.();

      expect(xhr.abort).toHaveBeenCalled();
      expect(mockRefreshTokens).toHaveBeenCalled();

      client.disconnect();
    });

    it('should halt reconnection if token is missing and refreshTokens fails (MOB-FIX-02)', async () => {
      mockGetToken.mockReturnValue(null as any);
      mockRefreshTokens.mockRejectedValueOnce(new Error('Refresh token invalid'));

      const requestId = 'req-no-token';
      const client = new BiddingSseClient(requestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        transport: 'xhr',
      });

      const errorCallback = jest.fn();
      client.on('error', errorCallback);

      await client.connect();

      expect(errorCallback).toHaveBeenCalled();
      expect(errorCallback.mock.calls[0][0].message).toContain('Authentication required');
      expect(mockXhrInstances.length).toBe(0); // Did not attempt connection with empty credentials

      client.disconnect();
    });

    it('should fallback to XHR if fetch lacks getReader without hanging on response.text()', async () => {
      const requestId = 'req-fallback';
      const client = new BiddingSseClient(requestId, {
        baseUrl: 'http://127.0.0.1:3000/api/v1',
        transport: 'fetch', // Force fetch attempt
      });

      // Response without getReader (React Native fetch simulation)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: {}, // No getReader!
      } as any);

      await client.connect();

      // Must have fallen back to XHR rather than hanging
      expect(mockXhrInstances.length).toBe(1);
      client.disconnect();
    });
  });
});
