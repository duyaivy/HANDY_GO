import type { ChatConversation } from '../types';
import type { BidCandidate, CandidatesDataDto } from '@/features/candidates/types/candidate.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { CandidatesApi } from '@/features/candidates/api/candidates.api';
import { terminateAllBiddingSseConnections } from '@/services/sse/use-bidding-events';
import { ChatDealBar } from '../chat-deal-bar';

const mockListeners: Record<string, Set<(data: unknown) => void>> = {};
jest.mock('@/services/sse/bidding-sse-client', () => ({
  BiddingSseClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    getIsOpen: () => true,
    on: (event: string, listener: (data: unknown) => void) => {
      mockListeners[event] ??= new Set();
      mockListeners[event].add(listener);
      return () => mockListeners[event].delete(listener);
    },
  })),
}));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: 'customer' } }),
    { subscribe: jest.fn() },
  ),
}));
jest.mock('@/features/candidates/api/candidates.api', () => ({ CandidatesApi: { getCandidatesData: jest.fn() } }));
jest.mock('@/features/orders/api/orders.api', () => ({
  OrdersApi: { getProposalsForRequest: jest.fn().mockResolvedValue({ data: [] }) },
}));
jest.mock('@/features/bidding/hooks/use-worker-bidding', () => ({
  useMyBidForRequest: () => ({ data: undefined }),
  useReviseBid: () => ({ isPending: false }),
  useRoundStatus: () => ({ data: { status: 'open', isExpired: false } }),
}));

const conversation: ChatConversation = {
  id: 'conversation',
  requestId: 'request',
  orderId: null,
  customerId: 'customer',
  workerId: 'target',
  status: 'OPEN',
  lastSequence: '0',
  lastMessageAt: null,
  createdAt: '2026-11-18',
  updatedAt: '2026-11-18',
  permissions: { read: true, send: true, reason: null },
  readStates: [],
};
let targetBid: BidCandidate;
let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  targetBid = {
    selectionSource: 'bid',
    sourceBidId: 'bid',
    id: 'bid',
    workerUserId: 'target',
    workerId: 'target',
    serviceRequestId: 'request',
    biddingRoundId: 'round',
    amount: 230000,
    status: 'active',
    version: 1,
    submittedAt: '2026-11-18',
    isMasked: false,
  };
  jest.mocked(CandidatesApi.getCandidatesData).mockImplementation(async (_id, params) => ({
    requestId: 'request',
    requestStatus: 'open_for_bidding',
    partial: false,
    bidding: {
      status: 'open',
      page: params!.page!,
      limit: 20,
      total: 21,
      items: params?.page === 1
        ? Array.from({ length: 20 }, (_, i) => ({ ...targetBid, workerUserId: `other-${i}`, workerId: `other-${i}`, id: `other-${i}` }))
        : [targetBid],
    },
    matching: { status: 'completed', displayLimit: 5, recommendations: [] },
  } satisfies CandidatesDataDto));
});
afterEach(() => {
  terminateAllBiddingSseConnections();
  Object.keys(mockListeners).forEach(key => delete mockListeners[key]);
  client.clear();
});

it('updates a later-page worker quote from a real bidding subscription and hides it when withdrawn', async () => {
  render(<QueryClientProvider client={client}><ChatDealBar conversation={conversation} userId="customer" /></QueryClientProvider>);
  expect(await screen.findByText('230.000 đ')).toBeTruthy();
  targetBid = { ...targetBid, amount: 300000, version: 2 };
  await act(async () => {
    mockListeners['bid.changed'].forEach(listener => listener({ requestId: 'request' }));
  });
  expect(await screen.findByText('300.000 đ')).toBeTruthy();
  targetBid = { ...targetBid, status: 'withdrawn' };
  await act(async () => {
    mockListeners['bid.changed'].forEach(listener => listener({ requestId: 'request' }));
  });
  await waitFor(() => expect(screen.queryByTestId('deal-bar-select-worker-btn')).toBeNull());
});
