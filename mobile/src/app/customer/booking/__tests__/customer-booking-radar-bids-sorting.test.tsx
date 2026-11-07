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
  useLocalSearchParams: jest.fn(() => ({ requestId: 'req-real-sorting-001' })),
}));

jest.mock('@/components/map/handy-map', () => ({
  HandyMap: () => null,
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useBookingDraftStore.getState().resetDraft();
});

describe('customerBookingRadarScreen - Bids Price Sorting & Comparison Data (TASK-07)', () => {
  it('automatically sorts bids by price in ascending order and displays complete comparison metrics', async () => {
    // 3 bids in arbitrary order: 250k, 150k, 200k
    const mockBidsResponse = {
      bidding: {
        status: 'open_for_bidding',
        items: [
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-expensive',
            workerUserId: 'worker-expensive',
            amount: 250000,
            status: 'active',
            workerProfile: {
              fullName: 'Nguyễn Văn Đắt',
              averageRating: 4.8,
              completedOrderCount: 45,
              distanceKm: 3.5,
              avatarUrl: 'https://example.com/avatar-dat.jpg',
            },
            message: 'Thợ lành nghề, dụng cụ chuyên nghiệp',
          },
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-cheapest',
            workerUserId: 'worker-cheapest',
            amount: 150000,
            status: 'active',
            workerProfile: {
              fullName: 'Trần Văn Rẻ',
              averageRating: 4.9,
              completedOrderCount: 120,
              distanceKm: 1.2,
              avatarUrl: 'https://example.com/avatar-re.jpg',
            },
            message: 'Giá ưu đãi nhất khu vực',
          },
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-medium',
            workerUserId: 'worker-medium',
            amount: 200000,
            status: 'active',
            workerProfile: {
              fullName: 'Lê Văn Vừa',
              averageRating: 5.0,
              completedOrderCount: 88,
              distanceKm: 2.1,
              avatarUrl: 'https://example.com/avatar-vua.jpg',
            },
            message: 'Đến nhanh trong 15 phút',
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
      data: { id: 'prop-123' } as any,
    });

    useBookingDraftStore.setState({
      createdRequestId: 'req-real-sorting-001',
      serviceName: 'Sửa máy giặt',
      description: 'Máy giặt rung lắc mạnh',
    });

    render(<CustomerBookingRadarScreen />);

    // 1. Wait for candidates to load and appear
    await waitFor(() => {
      expect(screen.getByText('Báo giá từ thợ (3)')).toBeOnTheScreen();
    });

    // 2. Verify all 3 workers and comparison data are visible
    expect(screen.getByText('Trần Văn Rẻ')).toBeOnTheScreen();
    expect(screen.getByText('Lê Văn Vừa')).toBeOnTheScreen();
    expect(screen.getByText('Nguyễn Văn Đắt')).toBeOnTheScreen();

    // Verify rating, completed orders, distance, and messages
    expect(screen.getByText('120 đơn')).toBeOnTheScreen();
    expect(screen.getByText('88 đơn')).toBeOnTheScreen();
    expect(screen.getByText('45 đơn')).toBeOnTheScreen();

    expect(screen.getByText('1.2km')).toBeOnTheScreen();
    expect(screen.getByText('2.1km')).toBeOnTheScreen();
    expect(screen.getByText('3.5km')).toBeOnTheScreen();

    expect(screen.getByText('"Giá ưu đãi nhất khu vực"')).toBeOnTheScreen();
    expect(screen.getByText('"Đến nhanh trong 15 phút"')).toBeOnTheScreen();
    expect(screen.getByText('"Thợ lành nghề, dụng cụ chuyên nghiệp"')).toBeOnTheScreen();

    // 3. Verify prices are rendered and "Giá tốt nhất" badge is attached to the cheapest (150.000đ)
    expect(screen.getByText('150.000đ')).toBeOnTheScreen();
    expect(screen.getByText('200.000đ')).toBeOnTheScreen();
    expect(screen.getByText('250.000đ')).toBeOnTheScreen();
    expect(screen.getByText('Giá tốt nhất')).toBeOnTheScreen();

    // 4. Verify sorting order:
    // Cheapest worker (150k - Trần Văn Rẻ) must be at index 0 (top of the list)
    // radar-select-worker-btn is rendered for idx === 0
    const topSelectBtn = screen.getByTestId('radar-select-worker-btn');
    expect(topSelectBtn).toBeOnTheScreen();

    // Selecting top worker creates proposal with cheapest worker
    fireEvent.press(topSelectBtn);

    await waitFor(() => {
      expect(createProposalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceRequestId: 'req-real-sorting-001',
          workerUserId: 'worker-cheapest',
          selectionSource: 'bid',
          sourceBidId: 'bid-cheapest',
          agreedPrice: 150000,
        }),
      );
    });
  });

  it('P2-06: places invalid or missing bid prices at the end of the list and does not tag invalid prices as Giá tốt nhất', async () => {
    const mockBidsWithInvalidPrice = {
      bidding: {
        status: 'open_for_bidding',
        items: [
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-mid',
            workerUserId: 'worker-mid',
            amount: 200000,
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Hợp Lệ 200k',
              averageRating: 4.8,
              completedOrderCount: 30,
              distanceKm: 2.0,
            },
          },
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-invalid',
            workerUserId: 'worker-invalid',
            amount: 0, // Giá không hợp lệ
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Giá Không Hợp Lệ',
              averageRating: 4.5,
              completedOrderCount: 10,
              distanceKm: 1.0,
            },
          },
          {
            selectionSource: 'bid',
            sourceBidId: 'bid-best',
            workerUserId: 'worker-best',
            amount: 150000, // Giá tốt nhất hợp lệ
            status: 'active',
            workerProfile: {
              fullName: 'Thợ Hợp Lệ 150k',
              averageRating: 4.9,
              completedOrderCount: 50,
              distanceKm: 1.5,
            },
          },
        ],
      },
      matching: {
        status: 'completed',
        recommendations: [],
      },
    };

    jest.spyOn(CandidatesApi, 'getCandidatesData').mockResolvedValue(mockBidsWithInvalidPrice as any);

    useBookingDraftStore.setState({
      createdRequestId: 'req-real-sorting-001',
      serviceName: 'Sửa điện',
    });

    render(<CustomerBookingRadarScreen />);

    await waitFor(() => {
      expect(screen.getByText('Báo giá từ thợ (3)')).toBeOnTheScreen();
    });

    // Thợ 150k phải ở đầu danh sách (idx === 0)
    expect(screen.getByText('Thợ Hợp Lệ 150k')).toBeOnTheScreen();
    expect(screen.getByText('150.000đ')).toBeOnTheScreen();
    expect(screen.getByText('Giá tốt nhất')).toBeOnTheScreen();

    // Thợ 200k ở vị trí thứ hai
    expect(screen.getByText('Thợ Hợp Lệ 200k')).toBeOnTheScreen();
    expect(screen.getByText('200.000đ')).toBeOnTheScreen();

    // Thợ giá không hợp lệ phải xếp cuối cùng và hiển thị 'Báo giá thỏa thuận'
    expect(screen.getByText('Thợ Giá Không Hợp Lệ')).toBeOnTheScreen();
    expect(screen.getByText('Báo giá thỏa thuận')).toBeOnTheScreen();
  });
});
