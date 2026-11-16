import type { ChatConversation } from '../types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { ChatDealBar } from '../chat-deal-bar';

const mockWorkerBid = {
  id: 'bid-111',
  serviceRequestId: 'req-001',
  workerId: 'worker-1',
  biddingRoundId: 'round-1',
  amount: 250000,
  message: 'Giá thương lượng',
  status: 'active',
  version: 1,
  submittedAt: '2026-11-16T10:00:00Z',
  revisionsCount: 0,
};

let mockMyBid: any = mockWorkerBid;
jest.mock('@/features/bidding/hooks/use-worker-bidding', () => ({
  useMyBidForRequest: () => ({
    data: mockMyBid,
    isLoading: false,
  }),
  useReviseBid: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

let mockCandidatesBids: any[] = [];
jest.mock('@/features/candidates/hooks/use-candidates', () => ({
  useCandidates: () => ({
    bids: mockCandidatesBids,
    isLoading: false,
  }),
}));

jest.mock('@/features/orders/api/orders.api', () => ({
  OrdersApi: {
    getProposalsForRequest: jest.fn().mockResolvedValue({ data: [] }),
    createProposal: jest.fn().mockResolvedValue({ data: { id: 'prop-1' } }),
  },
}));

const mockConversation: ChatConversation = {
  id: 'conv-1',
  requestId: 'req-001',
  orderId: null,
  customerId: 'customer-1',
  workerId: 'worker-1',
  customerName: 'Trần Thị Khách',
  workerName: 'Nguyễn Văn Thợ',
  serviceName: 'Sửa điện gia dụng',
  status: 'OPEN',
  lastSequence: '1',
  lastMessageAt: null,
  createdAt: '2026-11-16T10:00:00Z',
  updatedAt: '2026-11-16T10:00:00Z',
  permissions: { read: true, send: true, reason: null },
  readStates: [],
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('ChatDealBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMyBid = mockWorkerBid;
    mockCandidatesBids = [
      {
        id: 'bid-111',
        sourceBidId: 'bid-111',
        workerUserId: 'worker-1',
        workerId: 'worker-1',
        amount: 250000,
        status: 'active',
      },
    ];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders "Đã chốt đơn hàng" when conversation has orderId', () => {
    const closedConv = { ...mockConversation, orderId: 'ord-123' };
    render(
      <ChatDealBar conversation={closedConv} userId="worker-1" />,
      { wrapper },
    );

    expect(screen.getByText('Đã chốt đơn hàng')).toBeTruthy();
    expect(screen.queryByTestId('deal-bar-adjust-bid-btn')).toBeNull();
    expect(screen.queryByTestId('deal-bar-select-worker-btn')).toBeNull();
  });

  describe('Worker perspective', () => {
    it('renders current bid amount and "Điều chỉnh giá" button', () => {
      render(
        <ChatDealBar conversation={mockConversation} userId="worker-1" />,
        { wrapper },
      );

      expect(screen.getByText(/Báo giá của bạn:/)).toBeTruthy();
      expect(screen.getByText(/250\.000/)).toBeTruthy();
      expect(screen.getByTestId('deal-bar-adjust-bid-btn')).toBeTruthy();
      expect(screen.queryByTestId('deal-bar-select-worker-btn')).toBeNull();
    });

    it('opens adjust modal when clicking "Điều chỉnh giá"', () => {
      render(
        <ChatDealBar conversation={mockConversation} userId="worker-1" />,
        { wrapper },
      );

      fireEvent.press(screen.getByTestId('deal-bar-adjust-bid-btn'));
      expect(screen.getByText('Điều chỉnh báo giá')).toBeTruthy();
    });
  });

  describe('Customer perspective', () => {
    it('renders worker bid and "Chọn thợ này" button', async () => {
      render(
        <ChatDealBar conversation={mockConversation} userId="customer-1" />,
        { wrapper },
      );

      expect(screen.getByText(/Báo giá thợ:/)).toBeTruthy();
      expect(screen.getByText(/250\.000/)).toBeTruthy();
      expect(screen.getByTestId('deal-bar-select-worker-btn')).toBeTruthy();
      expect(screen.queryByTestId('deal-bar-adjust-bid-btn')).toBeNull();
    });

    it('prompts confirmation and calls createProposal and onSendMessage when choosing worker', async () => {
      const mockSendMessage = jest.fn().mockResolvedValue(undefined);
      let alertConfirmHandler: (() => void) | undefined;
      (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
        const confirmBtn = buttons?.find((b: any) => b.text === 'Đồng ý' || b.text === 'Xác nhận' || b.style !== 'cancel');
        alertConfirmHandler = confirmBtn?.onPress;
      });

      render(
        <ChatDealBar
          conversation={mockConversation}
          userId="customer-1"
          onSendMessage={mockSendMessage}
        />,
        { wrapper },
      );

      fireEvent.press(screen.getByTestId('deal-bar-select-worker-btn'));
      expect(Alert.alert).toHaveBeenCalledWith(
        'Xác nhận chọn thợ',
        expect.stringContaining('250.000'),
        expect.any(Array),
      );

      // Trigger confirm
      await act(async () => {
        await alertConfirmHandler?.();
      });

      await waitFor(() => {
        expect(OrdersApi.createProposal).toHaveBeenCalledWith({
          serviceRequestId: 'req-001',
          workerUserId: 'worker-1',
          selectionSource: 'bid',
          sourceBidId: 'bid-111',
          agreedPrice: 250000,
          agreedScope: 'Sửa điện gia dụng',
        });
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('250.000'),
      );
    });

    it('renders "Đã gửi đề xuất" when a proposal already exists for this worker', async () => {
      (OrdersApi.getProposalsForRequest as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: 'prop-existing',
            workerUserId: 'worker-1',
            status: 'proposed',
            agreedPrice: 250000,
          },
        ],
      });

      render(
        <ChatDealBar conversation={mockConversation} userId="customer-1" />,
        { wrapper },
      );

      await waitFor(() => {
        expect(screen.getByText(/Đã gửi đề xuất/)).toBeTruthy();
      });
      expect(screen.queryByTestId('deal-bar-select-worker-btn')).toBeNull();
    });
  });
});
