import type { BidDetail } from '../api/worker-bidding.api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { workerBiddingKeys } from '@/features/candidates/hooks/candidate-query-keys';
import { ApiClient } from '@/services/api/api-client';
import { useMyBidForRequest, useMyBidsForRequests, useSubmitBid, useWithdrawBid } from '../hooks/use-worker-bidding';

let mockWorkerId = 'worker-1';
jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => ({ id: mockWorkerId }) } } }));
jest.mock('@/services/api/api-client', () => ({ ApiClient: { get: jest.fn(), post: jest.fn() } }));

function makeBid(index: number, status = 'active'): BidDetail {
  return {
    id: `bid-${index}`,
    serviceRequestId: `request-${index}`,
    workerId: 'worker-1',
    biddingRoundId: 'round',
    status,
    amount: 100000,
    version: 1,
    submittedAt: '2026-01-01',
    revisionsCount: 0,
  };
}
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  jest.clearAllMocks();
  mockWorkerId = 'worker-1';
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => client.clear());

it.each([21, 50, 101])('finds bids beyond the first page of %i bids with bounded request-filtered queries', async (count) => {
  const bids = Array.from({ length: count }, (_, i) => makeBid(i, ['active', 'withdrawn', 'selected', 'rejected'][i % 4]));
  jest.mocked(ApiClient.get).mockImplementation(async (_url, options) => {
    const id = (options?.params as { serviceRequestId: string }).serviceRequestId;
    return { data: { items: bids.filter(bid => bid.serviceRequestId === id) } } as never;
  });
  const ids = bids.slice(-4).map(bid => bid.serviceRequestId);
  const { result } = renderHook(() => useMyBidsForRequests(ids), { wrapper });
  await waitFor(() => expect(result.current.every(query => query.isSuccess)).toBe(true));
  expect(result.current.map(query => query.data)).toEqual(bids.slice(-4));
  expect(ApiClient.get).toHaveBeenCalledTimes(4);
  expect(ApiClient.get).toHaveBeenCalledWith('/bids/me', expect.objectContaining({ params: { serviceRequestId: ids[0], limit: 1 } }));
});

it('distinguishes loading and error from confirmed absence', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(ApiClient.get).mockReturnValueOnce(new Promise((r) => {
    resolve = r;
  }) as never);
  const { result } = renderHook(() => useMyBidForRequest('request'), { wrapper });
  expect(result.current.isPending).toBe(true);
  expect(result.current.data).toBeUndefined();
  await act(async () => resolve({ data: { items: [] } }));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBeNull();
  jest.mocked(ApiClient.get).mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
});

it('shares card/modal cache and isolates workers and pages', async () => {
  jest.mocked(ApiClient.get).mockImplementation(async () => ({ data: { items: [makeBid(99)] } }) as never);
  const { result, rerender } = renderHook(
    (props: { ids: string[] }) => ({
      cards: useMyBidsForRequests(props.ids),
      modal: useMyBidForRequest(props.ids[0]),
    }),
    { wrapper, initialProps: { ids: ['request-99'] } },
  );
  await waitFor(() => expect(result.current.modal.isSuccess).toBe(true));
  expect(ApiClient.get).toHaveBeenCalledTimes(1);
  rerender({ ids: ['request-98'] });
  await waitFor(() => expect(ApiClient.get).toHaveBeenCalledTimes(2));
  mockWorkerId = 'worker-2';
  rerender({ ids: ['request-99'] });
  expect(result.current.modal.data).toBeUndefined();
  await waitFor(() => expect(ApiClient.get).toHaveBeenCalledTimes(3));
});

it('submit and withdraw update the shared authoritative request cache', async () => {
  const bid = makeBid(99);
  jest.mocked(ApiClient.post).mockResolvedValueOnce({ data: bid } as never);
  const { result } = renderHook(() => ({ submit: useSubmitBid(bid.serviceRequestId), withdraw: useWithdrawBid(bid.serviceRequestId) }), { wrapper });
  await act(async () => {
    await result.current.submit.mutateAsync({ amount: bid.amount });
  });
  expect(client.getQueryData(workerBiddingKeys.myBidForRequest(bid.workerId, bid.serviceRequestId))).toEqual(bid);
  const withdrawn = { ...bid, status: 'withdrawn', version: 2 };
  jest.mocked(ApiClient.post).mockResolvedValueOnce({ data: withdrawn } as never);
  await act(async () => {
    await result.current.withdraw.mutateAsync({ bidId: bid.id, payload: { version: 1 } });
  });
  expect(client.getQueryData(workerBiddingKeys.myBidForRequest(bid.workerId, bid.serviceRequestId))).toEqual(withdrawn);
});
