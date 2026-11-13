import type { DiscoverableJobItem } from '../api/worker-discovery.api';
import { render, screen } from '@testing-library/react-native';
import { WorkerBidModal } from '../components/worker-bid-modal';

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
