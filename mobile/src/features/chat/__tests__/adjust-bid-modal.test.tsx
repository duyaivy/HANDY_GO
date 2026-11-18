import type { BidDetail } from '@/features/bidding/api/worker-bidding.api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';
import { AdjustBidModal } from '../components/adjust-bid-modal';

const mockMutateAsync = jest.fn();
let mockBidDetailData: any;
let mockBidDetailLoading = false;
let mockBidDetailError = false;
const mockRefetchBidDetail = jest.fn();

jest.mock('@/features/bidding/hooks/use-worker-bidding', () => ({
  useReviseBid: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useBidDetail: (_bidId: string, enabled: boolean) => ({
    data: enabled ? mockBidDetailData : undefined,
    isLoading: enabled && mockBidDetailLoading,
    isError: enabled && mockBidDetailError,
    refetch: mockRefetchBidDetail,
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
  revisions: [
    {
      id: 'rev-1',
      revisionNo: 1,
      previousAmount: 200000,
      newAmount: 250000,
      revisedAt: '2026-11-16T10:05:00Z',
    },
  ],
};

let queryClient: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('AdjustBidModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBidDetailData = undefined;
    mockBidDetailLoading = false;
    mockBidDetailError = false;
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

  it('fills and submits a suggested price from a short amount', async () => {
    mockMutateAsync.mockResolvedValueOnce({ ...mockBid, amount: 230000 });
    render(<AdjustBidModal visible onClose={jest.fn()} bid={mockBid} requestId="req-456" />, { wrapper });
    fireEvent.changeText(screen.getByPlaceholderText('Nhập số tiền (VNĐ)'), '23');
    expect(screen.getByRole('button', { name: 'Chọn giá 23.000 đ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chọn giá 2.300.000 đ' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Chọn giá 230.000 đ' }));
    expect(screen.getByPlaceholderText('Nhập số tiền (VNĐ)')).toHaveDisplayValue('230000');
    expect(mockMutateAsync).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('submit-adjust-bid-btn'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ amount: 230000 }),
    })));
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

  it('handles 409 Conflict with retry prompt and query invalidation', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockMutateAsync.mockRejectedValueOnce({ statusCode: 409 });

    let reloadAction: (() => void) | undefined;
    (Alert.alert as jest.Mock).mockImplementation((title, _message, buttons) => {
      if (title === 'Xung đột phiên bản') {
        const reloadBtn = buttons?.find((b: any) => b.text === 'Tải lại');
        reloadAction = reloadBtn?.onPress;
      }
    });

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
    fireEvent.changeText(priceInput, '320000');

    const submitBtn = screen.getByTestId('submit-adjust-bid-btn');
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Xung đột phiên bản',
        expect.stringContaining('Bạn có muốn tải lại'),
        expect.any(Array),
      );
    });

    expect(invalidateSpy).toHaveBeenCalled();

    const refetchSpy = jest.spyOn(queryClient, 'refetchQueries');
    await act(async () => {
      await reloadAction?.();
    });
    expect(refetchSpy).toHaveBeenCalled();
  });

  it('renders cooldown countdown and disables submit when cooldown is active from latest revision', () => {
    const recentBid: BidDetail = {
      ...mockBid,
      revisionsCount: 1,
      revisions: [
        {
          id: 'rev-1',
          revisionNo: 1,
          previousAmount: 200000,
          newAmount: 250000,
          revisedAt: new Date(Date.now() - 30000).toISOString(), // 30s ago -> 90s remaining
        },
      ],
    };

    render(
      <AdjustBidModal
        visible={true}
        onClose={jest.fn()}
        bid={recentBid}
        requestId="req-456"
        cooldownCheck={true}
      />,
      { wrapper },
    );

    expect(screen.getByText(/Chờ \d+s để sửa tiếp/)).toBeTruthy();
    const submitBtn = screen.getByTestId('submit-adjust-bid-btn');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('does NOT enforce cooldown on 1st revision even if submitted recently', () => {
    const firstBid: BidDetail = {
      ...mockBid,
      revisionsCount: 0,
      revisions: [],
      submittedAt: new Date(Date.now() - 30000).toISOString(), // 30s ago
    };

    render(
      <AdjustBidModal
        visible={true}
        onClose={jest.fn()}
        bid={firstBid}
        requestId="req-456"
        cooldownCheck={true}
      />,
      { wrapper },
    );

    expect(screen.queryByText(/Chờ \d+s để sửa tiếp/)).toBeNull();
    const submitBtn = screen.getByTestId('submit-adjust-bid-btn');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(false);
  });

  it('fetches bid detail when revisionsCount > 0 but revisions list is missing', () => {
    const bidWithoutRevisions: BidDetail = {
      ...mockBid,
      revisionsCount: 1,
      revisions: undefined,
    };
    mockBidDetailLoading = true;

    render(
      <AdjustBidModal
        visible={true}
        onClose={jest.fn()}
        bid={bidWithoutRevisions}
        requestId="req-456"
        cooldownCheck={true}
      />,
      { wrapper },
    );

    expect(screen.getByText('Đang tải lịch sử điều chỉnh...')).toBeTruthy();
    const submitBtn = screen.getByTestId('submit-adjust-bid-btn');
    expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('shows error banner and allows retry when bid detail query fails', () => {
    const bidWithoutRevisions: BidDetail = {
      ...mockBid,
      revisionsCount: 1,
      revisions: undefined,
    };
    mockBidDetailError = true;

    render(
      <AdjustBidModal
        visible={true}
        onClose={jest.fn()}
        bid={bidWithoutRevisions}
        requestId="req-456"
        cooldownCheck={true}
      />,
      { wrapper },
    );

    expect(screen.getByText('Không thể tải lịch sử điều chỉnh báo giá.')).toBeTruthy();
    const retryBtn = screen.getByText('Thử lại');
    expect(retryBtn).toBeTruthy();
    fireEvent.press(retryBtn);
    expect(mockRefetchBidDetail).toHaveBeenCalled();
  });
});
