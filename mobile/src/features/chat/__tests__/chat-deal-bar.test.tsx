import type { ChatConversation } from '../types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';
import { CandidatesApi } from '@/features/candidates/api/candidates.api';
import { candidateQueryKeys } from '@/features/candidates/hooks/candidate-query-keys';
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
let mockRoundStatus: any = {
  status: 'open',
  isExpired: false,
  closesAt: new Date(Date.now() + 3600000).toISOString(),
};
let mockRoundStatusLoading = false;
let mockRoundStatusError = false;

jest.mock('@/features/bidding/hooks/use-worker-bidding', () => ({
  useMyBidForRequest: () => ({
    data: mockMyBid,
    isLoading: false,
  }),
  useReviseBid: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useRoundStatus: () => ({
    data: mockRoundStatus,
    isLoading: mockRoundStatusLoading,
    isError: mockRoundStatusError,
  }),
  useBidDetail: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}));

let mockCandidatesBids: any[] = [];

jest.mock('@/features/candidates/api/candidates.api', () => ({
  CandidatesApi: { getCandidatesData: jest.fn() },
}));
jest.mock('@/services/sse/use-bidding-events', () => ({ useBiddingEvents: jest.fn() }));

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
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('ChatDealBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMyBid = mockWorkerBid;
    mockRoundStatus = {
      status: 'open',
      isExpired: false,
      closesAt: new Date(Date.now() + 3600000).toISOString(),
    };
    mockRoundStatusLoading = false;
    mockRoundStatusError = false;
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
    jest.mocked(CandidatesApi.getCandidatesData).mockImplementation(async () => ({
      requestId: 'req-001',
      requestStatus: 'open_for_bidding',
      bidding: { status: 'open', total: mockCandidatesBids.length, page: 1, limit: 20, items: mockCandidatesBids },
      matching: { status: 'completed', displayLimit: 5, recommendations: [] },
      partial: false,
    }));
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
    it('renders current bid amount and enabled "Điều chỉnh giá" button when round is open', () => {
      render(
        <ChatDealBar conversation={mockConversation} userId="worker-1" />,
        { wrapper },
      );

      expect(screen.getByText(/Báo giá của bạn:/)).toBeTruthy();
      expect(screen.getByText(/250\.000/)).toBeTruthy();
      const adjustBtn = screen.getByTestId('deal-bar-adjust-bid-btn');
      expect(adjustBtn).toBeTruthy();
      expect(adjustBtn.props.accessibilityState?.disabled).toBe(false);
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

    it('disables "Điều chỉnh giá" button when bidding round is closed', () => {
      mockRoundStatus = { status: 'closed', isExpired: false };
      render(
        <ChatDealBar conversation={mockConversation} userId="worker-1" />,
        { wrapper },
      );

      const adjustBtn = screen.getByTestId('deal-bar-adjust-bid-btn');
      expect(adjustBtn.props.accessibilityState?.disabled).toBe(true);
      expect(screen.getByText(/Phiên báo giá đã kết thúc/)).toBeTruthy();

      fireEvent.press(adjustBtn);
      expect(screen.queryByText('Điều chỉnh báo giá')).toBeNull();
    });

    it('disables "Điều chỉnh giá" button when bidding round is expired', () => {
      mockRoundStatus = { status: 'open', isExpired: true };
      render(
        <ChatDealBar conversation={mockConversation} userId="worker-1" />,
        { wrapper },
      );

      const adjustBtn = screen.getByTestId('deal-bar-adjust-bid-btn');
      expect(adjustBtn.props.accessibilityState?.disabled).toBe(true);
    });

    it('disables "Điều chỉnh giá" button when round status fails to verify (fail-closed)', () => {
      mockRoundStatusError = true;
      render(
        <ChatDealBar conversation={mockConversation} userId="worker-1" />,
        { wrapper },
      );

      const adjustBtn = screen.getByTestId('deal-bar-adjust-bid-btn');
      expect(adjustBtn.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Customer perspective', () => {
    it('renders worker bid and "Chọn thợ này" button', async () => {
      render(
        <ChatDealBar conversation={mockConversation} userId="customer-1" />,
        { wrapper },
      );

      expect(await screen.findByText(/Báo giá thợ:/)).toBeTruthy();
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

      expect(await screen.findByTestId('deal-bar-select-worker-btn')).toBeTruthy();
      fireEvent.press(screen.getByTestId('deal-bar-select-worker-btn'));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
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
          supersedesProposalId: undefined,
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

    it('handles changes_requested proposal revision and includes supersedesProposalId', async () => {
      (OrdersApi.getProposalsForRequest as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: 'prop-rev-1',
            serviceRequestId: 'req-001',
            workerUserId: 'worker-1',
            status: 'changes_requested',
            revisionNo: 1,
            agreedPrice: 200000,
            responseNote: 'Vui lòng tăng phụ phí vật tư',
            createdAt: '2026-11-16T10:00:00Z',
          },
        ],
      });

      let alertConfirmHandler: (() => void) | undefined;
      (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
        const confirmBtn = buttons?.find((b: any) => b.text === 'Đồng ý');
        alertConfirmHandler = confirmBtn?.onPress;
      });

      render(
        <ChatDealBar conversation={mockConversation} userId="customer-1" />,
        { wrapper },
      );

      expect(await screen.findByText(/Thợ yêu cầu sửa đề xuất/)).toBeTruthy();
      expect(screen.getByText(/: "Vui lòng tăng phụ phí vật tư"/)).toBeTruthy();
      expect(screen.getByText('Gửi lại đề xuất')).toBeTruthy();

      fireEvent.press(screen.getByTestId('deal-bar-select-worker-btn'));

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(Alert.alert).toHaveBeenCalledWith(
        'Xác nhận gửi lại đề xuất',
        expect.stringContaining('250.000'),
        expect.any(Array),
      );

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
          supersedesProposalId: 'prop-rev-1',
        });
      });
    });

    it('selects the latest revision when multiple revisions exist', async () => {
      (OrdersApi.getProposalsForRequest as jest.Mock).mockResolvedValueOnce({
        data: [
          {
            id: 'prop-rev-1',
            workerUserId: 'worker-1',
            status: 'superseded',
            revisionNo: 1,
            createdAt: '2026-11-16T09:00:00Z',
          },
          {
            id: 'prop-rev-2',
            workerUserId: 'worker-1',
            status: 'changes_requested',
            revisionNo: 2,
            responseNote: 'Sửa lần 2',
            createdAt: '2026-11-16T10:00:00Z',
          },
        ],
      });

      let alertConfirmHandler: (() => void) | undefined;
      (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
        const confirmBtn = buttons?.find((b: any) => b.text === 'Đồng ý');
        alertConfirmHandler = confirmBtn?.onPress;
      });

      render(
        <ChatDealBar conversation={mockConversation} userId="customer-1" />,
        { wrapper },
      );

      expect(await screen.findByText(/Thợ yêu cầu sửa đề xuất/)).toBeTruthy();
      expect(screen.getByText(/: "Sửa lần 2"/)).toBeTruthy();

      fireEvent.press(screen.getByTestId('deal-bar-select-worker-btn'));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

      await act(async () => {
        await alertConfirmHandler?.();
      });

      await waitFor(() => {
        expect(OrdersApi.createProposal).toHaveBeenCalledWith(expect.objectContaining({
          supersedesProposalId: 'prop-rev-2',
        }));
      });
    });

    it('does not block customer selection when bidding round is closed during valid selection window', async () => {
      mockRoundStatus = { status: 'closed', isExpired: true };
      render(
        <ChatDealBar conversation={mockConversation} userId="customer-1" />,
        { wrapper },
      );

      expect(await screen.findByText(/Báo giá thợ:/)).toBeTruthy();
      const selectBtn = screen.getByTestId('deal-bar-select-worker-btn');
      expect(selectBtn).toBeTruthy();
      expect(selectBtn.props.accessibilityState?.disabled).toBe(false);
    });
  });

  it('refreshes the displayed quote when bidding data is invalidated', async () => {
    render(<ChatDealBar conversation={mockConversation} userId="customer-1" />, { wrapper });
    expect(await screen.findByText('250.000 đ')).toBeTruthy();
    mockCandidatesBids = [{ ...mockCandidatesBids[0], amount: 300000, version: 2 }];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: candidateQueryKeys.byRequest('req-001') });
    });
    expect(await screen.findByText('300.000 đ')).toBeTruthy();
  });

  it('requires a new confirmation if the quote changes while the confirmation is open', async () => {
    let confirm: (() => Promise<void>) | undefined;
    jest.mocked(Alert.alert).mockImplementation((_title, _message, buttons) => {
      confirm = buttons?.find(button => button.text === 'Đồng ý')?.onPress as typeof confirm;
    });
    render(<ChatDealBar conversation={mockConversation} userId="customer-1" />, { wrapper });
    expect(await screen.findByTestId('deal-bar-select-worker-btn')).toBeTruthy();
    fireEvent.press(screen.getByTestId('deal-bar-select-worker-btn'));
    await waitFor(() => expect(confirm).toBeDefined());
    mockCandidatesBids = [{ ...mockCandidatesBids[0], amount: 300000, version: 2 }];
    await act(async () => {
      await confirm?.();
    });
    expect(OrdersApi.createProposal).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('Báo giá đã thay đổi', expect.stringContaining('300.000'));
  });

  it.each(['withdrawn', 'unavailable'])('does not submit stale quotes when bidding becomes %s', async (status) => {
    let confirm: (() => Promise<void>) | undefined;
    jest.mocked(Alert.alert).mockImplementation((_title, _message, buttons) => {
      confirm = buttons?.find(button => button.text === 'Đồng ý')?.onPress as typeof confirm;
    });
    render(<ChatDealBar conversation={mockConversation} userId="customer-1" />, { wrapper });
    expect(await screen.findByTestId('deal-bar-select-worker-btn')).toBeTruthy();
    fireEvent.press(screen.getByTestId('deal-bar-select-worker-btn'));
    await waitFor(() => expect(confirm).toBeDefined());
    if (status === 'unavailable') {
      jest.mocked(CandidatesApi.getCandidatesData).mockRejectedValue(new Error('offline'));
    }
    else {
      mockCandidatesBids = [{ ...mockCandidatesBids[0], status }];
    }
    await act(async () => {
      await confirm?.();
    });
    expect(OrdersApi.createProposal).not.toHaveBeenCalled();
  });

  it('does not create a proposal when the customer leaves during price verification', async () => {
    let confirm: (() => Promise<void>) | undefined;
    jest.mocked(Alert.alert).mockImplementation((_title, _message, buttons) => {
      confirm = buttons?.find(button => button.text === 'Đồng ý')?.onPress as typeof confirm;
    });
    const view = render(<ChatDealBar conversation={mockConversation} userId="customer-1" />, { wrapper });
    expect(await screen.findByTestId('deal-bar-select-worker-btn')).toBeTruthy();
    fireEvent.press(screen.getByTestId('deal-bar-select-worker-btn'));
    jest.mocked(CandidatesApi.getCandidatesData).mockImplementation((_id, _params, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    let pending: Promise<void> | undefined;
    act(() => {
      pending = confirm?.();
    });
    await waitFor(() => expect(CandidatesApi.getCandidatesData).toHaveBeenCalledTimes(2));
    view.unmount();
    await act(async () => {
      await pending;
    });
    expect(OrdersApi.createProposal).not.toHaveBeenCalled();
  });
});
