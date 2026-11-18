import type { BidCandidate, CandidatesDataDto } from '../types/candidate.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { CandidatesApi } from '../api/candidates.api';
import { useConversationBid } from '../hooks/use-conversation-bid';

jest.mock('../api/candidates.api', () => ({ CandidatesApi: { getCandidatesData: jest.fn() } }));

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function page(pageNumber: number, total: number, items: BidCandidate[]): CandidatesDataDto {
  return {
    requestId: 'request',
    requestStatus: 'open_for_bidding',
    partial: false,
    bidding: { status: 'open', page: pageNumber, limit: 20, total, items },
    matching: { status: 'completed', displayLimit: 5, recommendations: [] },
  };
}
function bid(workerId: string): BidCandidate {
  return {
    selectionSource: 'bid',
    sourceBidId: `bid-${workerId}`,
    id: `bid-${workerId}`,
    workerUserId: workerId,
    workerId,
    serviceRequestId: 'request',
    biddingRoundId: 'round',
    amount: 230000,
    status: 'active',
    version: 1,
    submittedAt: '2026-11-18',
    isMasked: false,
  };
}
beforeEach(() => {
  jest.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

it('finds the conversation worker beyond the first twenty bids', async () => {
  const target = bid('target');
  jest.mocked(CandidatesApi.getCandidatesData)
    .mockResolvedValueOnce(page(1, 21, Array.from({ length: 20 }, (_, i) => bid(`other-${i}`))))
    .mockResolvedValueOnce(page(2, 21, [target]));
  const { result } = renderHook(() => useConversationBid('request', 'target'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(target);
  expect(CandidatesApi.getCandidatesData).toHaveBeenLastCalledWith('request', { page: 2, limit: 20 }, expect.any(AbortSignal));
});

it('stops at the last page when the worker is absent', async () => {
  jest.mocked(CandidatesApi.getCandidatesData).mockResolvedValue(page(1, 1, [bid('other')]));
  const { result } = renderHook(() => useConversationBid('request', 'target'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBeNull();
  expect(CandidatesApi.getCandidatesData).toHaveBeenCalledTimes(1);
});

it('treats a bidding outage as an error rather than absence', async () => {
  jest.mocked(CandidatesApi.getCandidatesData).mockResolvedValue({
    ...page(1, 0, []),
    partial: true,
    bidding: { ...page(1, 0, []).bidding, status: 'unavailable' },
  });
  const { result } = renderHook(() => useConversationBid('request', 'target'), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});

it('fails on an unexpectedly empty intermediate page instead of looping or claiming absence', async () => {
  jest.mocked(CandidatesApi.getCandidatesData).mockResolvedValue(page(1, 21, []));
  const { result } = renderHook(() => useConversationBid('request', 'target'), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(CandidatesApi.getCandidatesData).toHaveBeenCalledTimes(1);
});

it('does not fetch when disabled', () => {
  renderHook(() => useConversationBid('request', 'target', false), { wrapper });
  expect(CandidatesApi.getCandidatesData).not.toHaveBeenCalled();
});
