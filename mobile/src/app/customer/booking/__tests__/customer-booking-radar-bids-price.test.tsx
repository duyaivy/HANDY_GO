import * as React from 'react';
import { CandidatesApi } from '@/features/candidates/api/candidates.api';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
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

afterEach(() => {
  cleanup();
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

    // Clicking valid candidate submits proposal with correct agreedPrice
    fireEvent.press(screen.getByTestId('radar-select-worker-btn'));

    await waitFor(() => {
      expect(createProposalSpy).toHaveBeenCalledTimes(1);
    });

    expect(createProposalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceRequestId: 'req-real-price-001',
        workerUserId: 'worker-valid-1',
        selectionSource: 'bid',
        sourceBidId: 'bid-valid-1',
        agreedPrice: 180000,
      }),
    );
  });
});
