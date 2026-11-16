import type { BidDetail } from '@/features/bidding/api/worker-bidding.api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';
import { AdjustBidModal } from '../components/adjust-bid-modal';

const mockMutateAsync = jest.fn();
jest.mock('@/features/bidding/hooks/use-worker-bidding', () => ({
  useReviseBid: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

const mockBid: BidDetail = {
  id: 'bid-123',
  serviceRequestId: 'req-456',
  workerId: 'worker-789',
  biddingRoundId: 'round-1',
  amount: 250000,
  message: 'Báo giá ban đầu',
  status: 'active',
  version: 2,
  submittedAt: '2026-11-16T10:00:00Z',
  revisionsCount: 1,
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('AdjustBidModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders current bid amount and remaining revisions', () => {
    render(
      <AdjustBidModal
        visible={true}
        onClose={jest.fn()}
        bid={mockBid}
        requestId="req-456"
      />,
      { wrapper },
    );

    expect(screen.getByText('Điều chỉnh báo giá')).toBeTruthy();
    expect(screen.getByText(/Báo giá hiện tại:/)).toBeTruthy();
    expect(screen.getAllByText(/250\.000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Còn 4 lần điều chỉnh/)).toBeTruthy();
  });

  it('allows entering a new price and submits revision', async () => {
    const handleClose = jest.fn();
    const handleSuccess = jest.fn();
    mockMutateAsync.mockResolvedValueOnce({
      ...mockBid,
      amount: 300000,
      version: 3,
      revisionsCount: 2,
    });

    render(
      <AdjustBidModal
        visible={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
        bid={mockBid}
        requestId="req-456"
      />,
      { wrapper },
    );

    const priceInput = screen.getByPlaceholderText('Nhập số tiền (VNĐ)');
    fireEvent.changeText(priceInput, '300000');

    const noteInput = screen.getByPlaceholderText('Ghi chú cho khách (không bắt buộc)');
    fireEvent.changeText(noteInput, 'Đã giảm giá theo trao đổi');

    const submitBtn = screen.getByTestId('submit-adjust-bid-btn');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        bidId: 'bid-123',
        payload: {
          version: 2,
          amount: 300000,
          message: 'Đã giảm giá theo trao đổi',
        },
      });
    });

    expect(handleSuccess).toHaveBeenCalledWith(300000, 'Đã giảm giá theo trao đổi');
    expect(handleClose).toHaveBeenCalled();
  });

  it('validates minimum price and prevents submission if invalid', () => {
    render(
      <AdjustBidModal
        visible={true}
        onClose={jest.fn()}
        bid={mockBid}
        requestId="req-456"
      />,
      { wrapper },
    );

    const priceInput = screen.getByPlaceholderText('Nhập số tiền (VNĐ)');
    fireEvent.changeText(priceInput, '500'); // less than 1,000đ

    const submitBtn = screen.getByTestId('submit-adjust-bid-btn');
    fireEvent.press(submitBtn);

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Số tiền tối thiểu là 1.000 đ')).toBeTruthy();
  });

  it('disables adjusting when revisions limit is reached', () => {
    const maxedBid = { ...mockBid, revisionsCount: 5 };
    render(
      <AdjustBidModal
        visible={true}
        onClose={jest.fn()}
        bid={maxedBid}
        requestId="req-456"
      />,
      { wrapper },
    );

    expect(screen.getByText('Bạn đã đạt tối đa 5 lần điều chỉnh giá.')).toBeTruthy();
    const submitBtn = screen.getByTestId('submit-adjust-bid-btn');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });
});
