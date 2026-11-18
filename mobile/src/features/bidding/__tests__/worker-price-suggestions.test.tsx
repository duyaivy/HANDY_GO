import type { BidDetail } from '../api/worker-bidding.api';
import type { DiscoverableJobItem } from '../api/worker-discovery.api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { WorkerBidModal } from '../components/worker-bid-modal';

const mockRevise = jest.fn();
let mockRevisionsCount = 0;
jest.mock('../hooks/use-worker-bidding', () => ({
  useRoundStatus: () => ({ data: { status: 'open' } }),
  useMyBidForRequest: () => ({ data: {
    id: 'bid',
    status: 'active',
    amount: 250000,
    version: 2,
    revisionsCount: mockRevisionsCount,
  } as BidDetail }),
  useSubmitBid: () => ({ isPending: false }),
  useReviseBid: () => ({ isPending: false, mutateAsync: mockRevise }),
  useWithdrawBid: () => ({ isPending: false }),
}));
jest.mock('../hooks/use-deadline-clock', () => ({
  useDeadlineClock: () => ({ now: 1 }),
  isBeforeDeadline: () => true,
}));
jest.mock('@/features/chat/chat-entry', () => ({ ChatEntry: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockRevisionsCount = 0;
  mockRevise.mockResolvedValue({});
});

it('fills the selected suggestion and submits that amount as a revision', async () => {
  render(<WorkerBidModal visible onClose={jest.fn()} request={{ id: 'request' } as DiscoverableJobItem} />);
  const input = screen.getByPlaceholderText('Nhập số tiền (VD: 250000)');
  fireEvent.changeText(input, '23');
  fireEvent.press(screen.getByRole('button', { name: 'Chọn giá 230.000 đ' }));
  expect(input).toHaveDisplayValue('230000');
  expect(mockRevise).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Cập nhật báo giá'));
  await waitFor(() => expect(mockRevise).toHaveBeenCalledWith({
    bidId: 'bid',
    payload: { version: 2, amount: 230000, message: undefined },
  }));
});

it('prevents quick price changes after the revision limit', () => {
  mockRevisionsCount = 5;
  render(<WorkerBidModal visible onClose={jest.fn()} request={{ id: 'request' } as DiscoverableJobItem} />);
  expect(screen.queryByRole('button', { name: /Chọn giá/ })).toBeNull();
});
