import * as React from 'react';
import { Alert } from 'react-native';
import { CandidatesApi } from '@/features/candidates/api/candidates.api';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import CustomerBookingRadarScreen from '../radar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  })),
  useLocalSearchParams: jest.fn(() => ({ requestId: 'req-real-price-001' })),
}));

jest.mock('@/components/map/handy-map', () => ({
  HandyMap: () => null,
}));

beforeEach(() => {
  jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({ statusCode: 200, message: 'OK', data: null } as any);
  jest.spyOn(OrdersApi, 'getProposalsForRequest').mockResolvedValue({ statusCode: 200, message: 'OK', data: [] });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  useBookingDraftStore.getState().resetDraft();
});

describe('customerBookingRadarScreen - Invalid Bid Price Handling (PR62-05-P2 / RAD-02)', () => {
  it('disables proposal creation, displays "Không có giá hợp lệ" and "Báo giá không hợp lệ" for invalid bids', async () => {
    const mockBidsResponse = {
      bidding: {
        status: 'open_for_bidding',
        items: [
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-zero',
            workerUserId: 'worker-zero',
            amount: 0,
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Giá Không (0đ)',
              averageRating: 4.8,
              completedOrderCount: 10,
              distanceKm: 1.5,
              avatarUrl: 'https://example.com/avatar0.jpg',
            },
          },
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-null',
            workerUserId: 'worker-null',
            amount: null,
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Giá Null',
              averageRating: 4.7,
              completedOrderCount: 8,
              distanceKm: 2.0,
              avatarUrl: 'https://example.com/avatar-null.jpg',
            },
          },
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-negative',
            workerUserId: 'worker-negative',
            amount: -50000,
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Giá Âm',
              averageRating: 4.5,
              completedOrderCount: 5,
              distanceKm: 2.5,
              avatarUrl: 'https://example.com/avatar-neg.jpg',
            },
          },
        ],
      },
      matching: {
        status: 'completed',
        recommendations: [],
      },
    };

    jest.spyOn(CandidatesApi, 'getCandidatesData').mockResolvedValue(mockBidsResponse as any);
    const createProposalSpy = jest.spyOn(OrdersApi, 'createProposal');

    useBookingDraftStore.setState({
      createdRequestId: 'req-real-price-001',
      serviceName: 'Sửa điện',
    });

    render(<CustomerBookingRadarScreen />);

    await waitFor(() => {
      expect(screen.getByText('Báo giá từ thợ (3)')).toBeOnTheScreen();
    });

    // Check display text for invalid bids
    expect(screen.getAllByText('Không có giá hợp lệ')).toHaveLength(3);
    expect(screen.getAllByText('Báo giá không hợp lệ')).toHaveLength(3);
    expect(screen.getAllByText('Không thể chọn')).toHaveLength(3);

    // Verify selecting any invalid bid does not trigger proposal API
    const selectButtons = screen.getAllByText('Không thể chọn');
    expect(selectButtons).toHaveLength(3);

    const firstSelectBtn = screen.getByTestId('radar-select-worker-btn');
    expect(firstSelectBtn.props.accessibilityState?.disabled).toBe(true);

    // Normal fireEvent.press is ignored on disabled Pressable
    fireEvent.press(firstSelectBtn);
    expect(createProposalSpy).not.toHaveBeenCalled();
  });

  it('submits exact agreedPrice for valid positive bid prices', async () => {
    const mockBidsResponse = {
      bidding: {
        status: 'open_for_bidding',
        items: [
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-valid-1',
            version: 3,
            workerUserId: 'worker-valid-1',
            amount: 180000,
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Giá Hợp Lệ 180k',
              averageRating: 4.9,
              completedOrderCount: 50,
              distanceKm: 1.2,
              avatarUrl: 'https://example.com/avatar1.jpg',
            },
            message: 'Đến ngay trong 20 phút',
          },
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-invalid-2',
            workerUserId: 'worker-invalid-2',
            amount: 0,
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Giá 0đ',
              averageRating: 4.6,
              completedOrderCount: 15,
              distanceKm: 3.0,
              avatarUrl: 'https://example.com/avatar2.jpg',
            },
          },
        ],
      },
      matching: {
        status: 'completed',
        recommendations: [],
      },
    };

    jest.spyOn(CandidatesApi, 'getCandidatesData').mockResolvedValue(mockBidsResponse as any);
    const createProposalSpy = jest.spyOn(OrdersApi, 'createProposal').mockResolvedValue({
      statusCode: 201,
      message: 'Created',
      data: { id: 'prop-price-valid-001' } as any,
    });

    useBookingDraftStore.setState({
      createdRequestId: 'req-real-price-001',
      serviceName: 'Sửa điện',
    });

    render(<CustomerBookingRadarScreen />);

    await waitFor(() => {
      expect(screen.getByText('Báo giá từ thợ (2)')).toBeOnTheScreen();
    });

    // Valid candidate should show price and "Chọn thợ" button
    expect(screen.getByText('180.000đ')).toBeOnTheScreen();
    expect(screen.getByText('Thợ Giá Hợp Lệ 180k')).toBeOnTheScreen();
    expect(screen.getByText('Chọn thợ')).toBeOnTheScreen();

    // Invalid candidate should show "Không có giá hợp lệ" and "Không thể chọn"
    expect(screen.getByText('Không có giá hợp lệ')).toBeOnTheScreen();
    expect(screen.getByText('Không thể chọn')).toBeOnTheScreen();

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // Clicking valid candidate submits proposal with correct agreedPrice
    fireEvent.press(screen.getByTestId('radar-select-worker-btn'));
    expect(createProposalSpy).not.toHaveBeenCalled();
    const confirmation = jest.mocked(Alert.alert).mock.calls.find(([title]) => title === 'Xác nhận gửi đề xuất');
    expect(confirmation?.[1]).toContain('Phạm vi:');
    expect(confirmation?.[2]?.[0]).toMatchObject({ text: 'Quay lại', style: 'cancel' });
    await act(async () => {
      await confirmation?.[2]?.[1]?.onPress?.();
    });

    await waitFor(() => {
      expect(createProposalSpy).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith('Đã gửi đề xuất dịch vụ!', expect.any(String), expect.any(Array));
    });

    expect(createProposalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceRequestId: 'req-real-price-001',
        workerUserId: 'worker-valid-1',
        selectionSource: 'bid',
        sourceBidId: 'bid-valid-1',
        expectedBidVersion: 3,
        agreedPrice: 180000,
      }),
    );
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Đã gửi đề xuất dịch vụ!',
      expect.any(String),
      expect.any(Array),
    ));
  });
});

it('sends a recommendation invitation with a note and no booking proposal', async () => {
  jest.spyOn(CandidatesApi, 'getCandidatesData').mockResolvedValue({
    bidding: { status: 'open', items: [] },
    matching: {
      status: 'completed',
      recommendations: [{
        workerUserId: 'worker-matched',
        sourceMatchResultId: 'match-1',
        matchingScore: 88,
        workerProfile: { fullName: 'Thợ được gợi ý' },
      }],
    },
  } as any);
  const invite = jest.spyOn(OrdersApi, 'createQuoteInvitation').mockResolvedValue({
    data: { id: 'invite-1', workerUserId: 'worker-matched', note: 'Có kiểm tra tận nơi không?' },
  } as Awaited<ReturnType<typeof OrdersApi.createQuoteInvitation>>);
  const proposal = jest.spyOn(OrdersApi, 'createProposal');

  render(<CustomerBookingRadarScreen />);
  fireEvent.press(await screen.findByText('Hỏi giá'));
  expect(screen.queryByText('200.000đ')).toBeNull();
  expect(screen.queryByText('Chọn thợ')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Lời nhắn cho thợ'), '  Có kiểm tra tận nơi không?  ');
  fireEvent.press(screen.getByText('Gửi hỏi giá'));

  expect(await screen.findByText('Chờ thợ báo giá')).toBeOnTheScreen();
  expect(invite).toHaveBeenCalledWith('req-real-price-001', {
    workerUserId: 'worker-matched',
    sourceMatchResultId: 'match-1',
    note: 'Có kiểm tra tận nơi không?',
  });
  expect(proposal).not.toHaveBeenCalled();
});

it('cancels without sending and preserves confirmed terms across a render, then reloads on stale terms', async () => {
  const candidates = jest.spyOn(CandidatesApi, 'getCandidatesData').mockResolvedValue({
    bidding: { status: 'open', items: [{
      selectionSource: 'bid',
      sourceBidId: 'bid-snapshot',
      version: 4,
      workerUserId: 'worker-snapshot',
      amount: 250000,
      status: 'active',
      workerProfile: { fullName: 'Thợ Snapshot' },
    }] },
    matching: { status: 'completed', recommendations: [] },
  } as any);
  const create = jest.spyOn(OrdersApi, 'createProposal').mockRejectedValue({
    response: { status: 409, data: { code: 'BID_TERMS_CHANGED' } },
  });
  useBookingDraftStore.setState({
    createdRequestId: 'req-real-price-001',
    serviceName: 'Sửa điện',
    scheduledAt: '2026-12-01T09:00:00.000Z',
  });
  render(<CustomerBookingRadarScreen />);
  await screen.findByText('Thợ Snapshot');
  const button = screen.getByTestId('radar-select-worker-btn');
  fireEvent.press(button);
  const canceled = jest.mocked(Alert.alert).mock.calls.at(-1)!;
  await act(async () => {
    canceled[2]?.[0]?.onPress?.();
  });
  expect(create).not.toHaveBeenCalled();

  fireEvent.press(button);
  const confirmation = jest.mocked(Alert.alert).mock.calls.at(-1)!;
  expect(confirmation[1]).toContain('Thợ Snapshot');
  expect(confirmation[1]).toContain('250.000đ');
  expect(confirmation[1]).toContain('Phạm vi: Sửa điện');
  expect(confirmation[1]).toContain('Lịch hẹn:');
  await act(async () => {
    useBookingDraftStore.setState({ serviceName: 'Sửa nước', scheduledAt: '2026-12-02T09:00:00.000Z' });
  });
  const reads = candidates.mock.calls.length;
  await act(async () => {
    await confirmation[2]?.[1]?.onPress?.();
  });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    sourceBidId: 'bid-snapshot',
    expectedBidVersion: 4,
    agreedPrice: 250000,
    agreedScope: 'Sửa điện',
    scheduledAt: '2026-12-01T09:00:00.000Z',
  }));
  expect(Alert.alert).toHaveBeenCalledWith('Báo giá đã thay đổi', expect.any(String));
  await waitFor(() => expect(candidates.mock.calls.length).toBeGreaterThan(reads));
  expect(create).toHaveBeenCalledTimes(1);
});
