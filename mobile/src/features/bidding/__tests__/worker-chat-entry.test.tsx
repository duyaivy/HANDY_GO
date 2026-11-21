import type { DiscoverableJobItem } from '../api/worker-discovery.api';
import { render, screen } from '@testing-library/react-native';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { WorkerBidModal } from '../components/worker-bid-modal';

let mockUserId: string | undefined;
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: (select: (state: { user?: { id: string } }) => unknown) =>
    select({ user: mockUserId ? { id: mockUserId } : undefined }),
}));

let mockBid: { id: string; status: string } | undefined;
jest.mock('../hooks/use-worker-bidding', () => ({
  useRoundStatus: () => ({ data: { status: 'open' } }),
  useMyBidForRequest: () => ({ data: mockBid }),
  useSubmitBid: () => ({ isPending: false }),
  useReviseBid: () => ({ isPending: false }),
  useWithdrawBid: () => ({ isPending: false }),
}));
jest.mock('../hooks/use-deadline-clock', () => ({
  useDeadlineClock: () => ({ now: 1 }),
  isBeforeDeadline: () => true,
}));
jest.mock('@/features/chat/chat-entry', () => ({
  ChatEntry: ({ bidId }: { bidId?: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'worker-chat-entry' }, bidId || 'no-bid');
  },
}));

it.each([undefined, 'withdrawn', 'rejected', 'expired'])('keeps the chat entry in the bid modal for status %s', (status) => {
  mockBid = status ? { id: 'persisted-bid', status } : undefined;
  render(<WorkerBidModal visible onClose={jest.fn()} request={{ id: 'request' } as DiscoverableJobItem} />);
  expect(screen.getByTestId('worker-chat-entry')).toHaveTextContent(status ? 'persisted-bid' : 'no-bid');
});

it('shows the addressed quote invitation note before the worker submits a bid', async () => {
  mockUserId = 'worker-1';
  mockBid = undefined;
  const list = jest.spyOn(OrdersApi, 'listQuoteInvitations').mockResolvedValue({
    data: [{ id: 'invitation-1', workerUserId: 'worker-1', note: 'Có kiểm tra tận nơi không?' }],
  } as Awaited<ReturnType<typeof OrdersApi.listQuoteInvitations>>);
  try {
    render(<WorkerBidModal visible onClose={jest.fn()} request={{ id: 'request' } as DiscoverableJobItem} />);
    expect(await screen.findByText('Có kiểm tra tận nơi không?')).toBeOnTheScreen();
    expect(list).toHaveBeenCalledWith('request', expect.any(AbortSignal));
    expect(screen.getByTestId('worker-chat-entry')).toHaveTextContent('no-bid');
  }
  finally {
    list.mockRestore();
    mockUserId = undefined;
  }
});
