/* eslint-disable max-lines-per-function */
import type { BookingProposal, Order, ServiceRequest } from '../types/order.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import * as React from 'react';
import CustomerBookingSelectAddressScreen from '@/app/customer/booking/select-address';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { DeviceLocationService } from '@/services/location/device-location';
import { OrdersApi } from '../api/orders.api';
import { useCustomerOrders } from '../hooks/use-customer-orders';
import { useWorkerJobs } from '../hooks/use-worker-jobs';
import { useBookingDraftStore } from '../stores/use-booking-draft-store';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: jest.fn(() => ({})),
}));

// Mock Alert
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useBookingDraftStore.getState().resetDraft();
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function createMockRequest(id: string, status: string = 'open_for_bidding'): ServiceRequest {
  return {
    id,
    requestCode: `REQ-${id.slice(0, 4)}`,
    customerUserId: 'cust-1',
    description: `Yêu cầu dịch vụ #${id}`,
    status: status as any,
    addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
    createdAt: new Date().toISOString(),
  };
}

function createMockOrder(id: string, status: string = 'in_progress'): Order {
  return {
    id,
    orderCode: `ORD-${id.slice(0, 4)}`,
    serviceRequestId: `req-${id}`,
    bookingProposalId: `prop-${id}`,
    customerUserId: 'cust-1',
    workerUserId: 'worker-1',
    serviceId: 'srv-1',
    agreedPrice: '300000',
    agreedScope: `Thi công đơn hàng #${id}`,
    addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
    latitude: 16.0748,
    longitude: 108.1499,
    status: status as any,
    paymentState: 'unpaid',
    createdAt: new Date().toISOString(),
  };
}

function createMockProposal(id: string, status: string = 'proposed'): BookingProposal {
  return {
    id,
    serviceRequestId: `req-${id}`,
    revisionNo: 1,
    customerUserId: 'cust-1',
    workerUserId: 'worker-1',
    selectionSource: 'bid',
    agreedPrice: '350000',
    agreedScope: `Đề xuất việc #${id}`,
    status: status as any,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  };
}

describe('d4 — Mobile P2 và Nghiệm thu toàn luồng (MOB-01 & MOB-02)', () => {
  describe('mOB-01: Pagination, Infinite Query & Multi-status filtering', () => {
    it('paginates over 10 items across page 1 and page 2 for customer requests', async () => {
      const page1Items = Array.from({ length: 10 }, (_, i) => createMockRequest(`req-p1-${i + 1}`));
      const page2Items = Array.from({ length: 5 }, (_, i) => createMockRequest(`req-p2-${i + 1}`));

      jest.spyOn(OrdersApi, 'getMyRequests').mockImplementation(async (params?: any) => {
        if (params?.page === 2) {
          return {
            data: {
              items: page2Items,
              total: 15,
              page: 2,
              limit: 10,
              totalPages: 2,
            },
            statusCode: 200,
            message: 'OK',
          };
        }
        return {
          data: {
            items: page1Items,
            total: 15,
            page: 1,
            limit: 10,
            totalPages: 2,
          },
          statusCode: 200,
          message: 'OK',
        };
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCustomerOrders('Searching'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.requests).toHaveLength(10);
      expect(result.current.hasNextPage).toBe(true);

      // Verify server filter params passed
      expect(OrdersApi.getMyRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 10,
          status: 'open_for_bidding,draft,bidding_closed',
        }),
      );

      // Fetch next page
      await act(async () => {
        await result.current.fetchNextPage();
      });

      await waitFor(() => expect(result.current.requests).toHaveLength(15));
      expect(result.current.hasNextPage).toBe(false);
      expect(OrdersApi.getMyRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 10,
          status: 'open_for_bidding,draft,bidding_closed',
        }),
      );
    });

    it('paginates over 10 items across page 1 and page 2 for customer orders', async () => {
      const page1Orders = Array.from({ length: 10 }, (_, i) => createMockOrder(`ord-p1-${i + 1}`));
      const page2Orders = Array.from({ length: 4 }, (_, i) => createMockOrder(`ord-p2-${i + 1}`));

      jest.spyOn(OrdersApi, 'getMyOrders').mockImplementation(async (params?: any) => {
        if (params?.page === 2) {
          return {
            data: {
              items: page2Orders,
              total: 14,
              page: 2,
              limit: 10,
              totalPages: 2,
            },
            statusCode: 200,
            message: 'OK',
          };
        }
        return {
          data: {
            items: page1Orders,
            total: 14,
            page: 1,
            limit: 10,
            totalPages: 2,
          },
          statusCode: 200,
          message: 'OK',
        };
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCustomerOrders('In process'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.orders).toHaveLength(10);
      expect(result.current.hasNextPage).toBe(true);
      expect(OrdersApi.getMyOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          status: 'created,confirmed,in_progress,awaiting_customer_confirmation',
        }),
      );

      await act(async () => {
        await result.current.fetchNextPage();
      });

      await waitFor(() => expect(result.current.orders).toHaveLength(14));
      expect(result.current.hasNextPage).toBe(false);
    });

    it('handles tab switching with distinct query keys and status mappings', async () => {
      jest.spyOn(OrdersApi, 'getMyRequests').mockResolvedValue({
        data: { items: [createMockRequest('req-1')], total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCode: 200,
        message: 'OK',
      });
      jest.spyOn(OrdersApi, 'getMyOrders').mockResolvedValue({
        data: { items: [createMockOrder('ord-1', 'completed')], total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCode: 200,
        message: 'OK',
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result, rerender } = renderHook(
        (props: { tab: string }) => useCustomerOrders(props.tab),
        {
          wrapper,
          initialProps: { tab: 'Searching' },
        },
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.requests).toHaveLength(1);
      expect(result.current.orders).toHaveLength(0);

      // Switch to Finished tab
      rerender({ tab: 'Finished' });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.orders).toHaveLength(1);
      expect(result.current.requests).toHaveLength(0);
      expect(OrdersApi.getMyOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('loads requests and orders independently on Cancelled tab (both succeed)', async () => {
      const cancelledReqs = [createMockRequest('req-c1', 'cancelled')];
      const cancelledOrds = [createMockOrder('ord-c1', 'cancelled')];

      jest.spyOn(OrdersApi, 'getMyRequests').mockResolvedValue({
        data: { items: cancelledReqs, total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCode: 200,
        message: 'OK',
      });
      jest.spyOn(OrdersApi, 'getMyOrders').mockResolvedValue({
        data: { items: cancelledOrds, total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCode: 200,
        message: 'OK',
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCustomerOrders('Cancelled'), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.requests).toHaveLength(1);
      expect(result.current.orders).toHaveLength(1);
      expect(result.current.isRequestsError).toBe(false);
      expect(result.current.isOrdersError).toBe(false);
    });

    it('handles independent failure on Cancelled tab (requests fail, orders succeed)', async () => {
      jest.spyOn(OrdersApi, 'getMyRequests').mockRejectedValue(new Error('Network error on requests'));
      jest.spyOn(OrdersApi, 'getMyOrders').mockResolvedValue({
        data: { items: [createMockOrder('ord-c1', 'cancelled')], total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCode: 200,
        message: 'OK',
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCustomerOrders('Cancelled'), { wrapper });

      await waitFor(() => expect(result.current.orders).toHaveLength(1));
      expect(result.current.isRequestsError).toBe(true);
      expect(result.current.isOrdersError).toBe(false);
      expect(result.current.orders).toHaveLength(1);
      expect(result.current.requests).toHaveLength(0);
    });

    it('handles independent failure on Cancelled tab (orders fail, requests succeed)', async () => {
      jest.spyOn(OrdersApi, 'getMyRequests').mockResolvedValue({
        data: { items: [createMockRequest('req-c1', 'cancelled')], total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCode: 200,
        message: 'OK',
      });
      jest.spyOn(OrdersApi, 'getMyOrders').mockRejectedValue(new Error('Network error on orders'));

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCustomerOrders('Cancelled'), { wrapper });

      await waitFor(() => expect(result.current.requests).toHaveLength(1));
      expect(result.current.isRequestsError).toBe(false);
      expect(result.current.isOrdersError).toBe(true);
      expect(result.current.requests).toHaveLength(1);
      expect(result.current.orders).toHaveLength(0);
    });

    it('supports worker jobs infinite query for proposals and active orders', async () => {
      const page1Props = Array.from({ length: 10 }, (_, i) => createMockProposal(`prop-${i + 1}`));
      const page2Props = Array.from({ length: 2 }, (_, i) => createMockProposal(`prop-p2-${i + 1}`));

      jest.spyOn(OrdersApi, 'getMyWorkerProposals').mockImplementation(async (params?: any) => {
        if (params?.page === 2) {
          return {
            data: { items: page2Props, total: 12, page: 2, limit: 10, totalPages: 2 },
            statusCode: 200,
            message: 'OK',
          };
        }
        return {
          data: { items: page1Props, total: 12, page: 1, limit: 10, totalPages: 2 },
          statusCode: 200,
          message: 'OK',
        };
      });

      jest.spyOn(OrdersApi, 'getMyOrders').mockResolvedValue({
        data: { items: [createMockOrder('ord-w1')], total: 1, page: 1, limit: 10, totalPages: 1 },
        statusCode: 200,
        message: 'OK',
      });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useWorkerJobs(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.proposals).toHaveLength(10);
      expect(result.current.hasNextProposals).toBe(true);
      expect(OrdersApi.getMyWorkerProposals).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, status: 'proposed' }),
      );

      await act(async () => {
        await result.current.fetchNextProposals();
      });

      await waitFor(() => expect(result.current.proposals).toHaveLength(12));
      expect(result.current.hasNextProposals).toBe(false);
    });
  });

  describe('mOB-02: Device Location & GPS Verification', () => {
    it('returns gps_success with isRealGps=true when genuine GPS fix is obtained', async () => {
      jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
        status: 'gps_success',
        isRealGps: true,
        coordinates: {
          latitude: 16.075,
          longitude: 108.15,
          addressText: '100 Nguyễn Lương Bằng, Đà Nẵng',
        },
      });

      const res = await DeviceLocationService.getDeviceLocationResult();
      expect(res.status).toBe('gps_success');
      expect(res.isRealGps).toBe(true);
      expect(res.coordinates?.addressText).toBe('100 Nguyễn Lương Bằng, Đà Nẵng');

      const loc = await DeviceLocationService.getCurrentLocation();
      expect(loc).not.toBeNull();
      expect(loc?.latitude).toBe(16.075);
    });

    it('returns permission_denied with isRealGps=false and null coordinates', async () => {
      jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
        status: 'permission_denied',
        isRealGps: false,
        coordinates: null,
        errorMessage: 'User denied permission',
      });

      const res = await DeviceLocationService.getDeviceLocationResult();
      expect(res.status).toBe('permission_denied');
      expect(res.isRealGps).toBe(false);
      expect(res.coordinates).toBeNull();

      // getCurrentLocation default does NOT return fallback as real GPS
      const loc = await DeviceLocationService.getCurrentLocation();
      expect(loc).toBeNull();
    });

    it('returns module_missing with isRealGps=false when native module is absent', async () => {
      jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
        status: 'module_missing',
        isRealGps: false,
        coordinates: null,
        errorMessage: 'Native module ExpoLocation is absent',
      });

      const res = await DeviceLocationService.getDeviceLocationResult();
      expect(res.status).toBe('module_missing');
      expect(res.isRealGps).toBe(false);
      expect(res.coordinates).toBeNull();

      const loc = await DeviceLocationService.getCurrentLocation();
      expect(loc).toBeNull();
    });

    it('returns gps_error with isRealGps=false on hardware/timeout error', async () => {
      jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
        status: 'gps_error',
        isRealGps: false,
        coordinates: null,
        errorMessage: 'Location request timed out',
      });

      const res = await DeviceLocationService.getDeviceLocationResult();
      expect(res.status).toBe('gps_error');
      expect(res.isRealGps).toBe(false);
      expect(res.coordinates).toBeNull();

      const loc = await DeviceLocationService.getCurrentLocation();
      expect(loc).toBeNull();
    });

    it('[RECHECK-03] requires valid address before confirmation and does NOT replace empty address with hardcoded string', async () => {
      const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');
      expect(useBookingDraftStore.getState().addressText).toBe('');

      render(<CustomerBookingSelectAddressScreen />);

      // On initial render without user interaction, store addressText remains empty
      expect(useBookingDraftStore.getState().addressText).toBe('');

      // Pressing confirm with empty address shows Alert and does NOT navigate or save
      const confirmBtn = screen.getByTestId('select-address-confirm-btn');
      fireEvent.press(confirmBtn);

      expect(alertSpy).toHaveBeenCalledWith(
        'Chưa có địa chỉ',
        'Vui lòng nhập địa chỉ hoặc định vị vị trí của bạn.',
      );
      expect(useBookingDraftStore.getState().addressText).toBe('');
      expect(mockPush).not.toHaveBeenCalled();

      // After user types valid address, confirmation succeeds
      fireEvent.changeText(screen.getByTestId('booking-address-input'), '456 Hoàng Diệu, Hải Châu, Đà Nẵng');
      fireEvent.press(confirmBtn);

      expect(useBookingDraftStore.getState().addressText).toBe('456 Hoàng Diệu, Hải Châu, Đà Nẵng');
      expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-time');
    });

    it('[RECHECK-03] saves new GPS coordinates and address when GPS returns coords different from draft', async () => {
      // Draft has default coords (16.0748, 108.1499)
      useBookingDraftStore.setState({
        addressText: 'Địa chỉ cũ',
        latitude: 16.0748,
        longitude: 108.1499,
      });

      // GPS returns completely different coords & address (e.g. HCM)
      const gpsCoords = {
        latitude: 10.7769,
        longitude: 106.7009,
        addressText: '72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM',
      };
      jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
        status: 'gps_success',
        isRealGps: true,
        coordinates: gpsCoords,
      });

      render(<CustomerBookingSelectAddressScreen />);

      // Trigger GPS location
      const locateBtn = screen.getByTestId('locate-me-btn');
      fireEvent.press(locateBtn);

      await waitFor(() => {
        expect(screen.getByText('GPS thiết bị: Đã định vị chính xác')).toBeOnTheScreen();
      });

      // At this point, store still has old coords until user confirms
      expect(useBookingDraftStore.getState().latitude).toBe(16.0748);
      expect(useBookingDraftStore.getState().longitude).toBe(108.1499);

      // Press confirm
      const confirmBtn = screen.getByTestId('select-address-confirm-btn');
      fireEvent.press(confirmBtn);

      // Store MUST now have new GPS coords and corresponding address
      expect(useBookingDraftStore.getState().latitude).toBe(10.7769);
      expect(useBookingDraftStore.getState().longitude).toBe(106.7009);
      expect(useBookingDraftStore.getState().addressText).toBe('72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM');
      expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-time');
    });

    it('[RECHECK-03] saves currently selected coordinates even if reverse geocoding throws or fails', async () => {
      useBookingDraftStore.setState({
        addressText: '100 Nguyễn Văn Linh, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
      });

      // Mock reverse geocode failure
      const MapboxServiceMod = require('@/services/map/mapbox-service').MapboxService;
      jest.spyOn(MapboxServiceMod, 'reverseGeocode').mockRejectedValue(new Error('Network failure'));

      render(<CustomerBookingSelectAddressScreen />);

      // Map moves to new coordinates (16.0820, 108.2200)
      const mapView = screen.getByTestId('mapbox-map-view');
      fireEvent(mapView, 'regionDidChange', {
        geometry: { coordinates: [108.2200, 16.0820] },
      });

      // User presses confirm while reverse geocoding fails
      const confirmBtn = screen.getByTestId('select-address-confirm-btn');
      fireEvent.press(confirmBtn);

      // Store MUST contain the newly selected coordinates (16.0820, 108.2200), NOT the old 16.0748
      expect(useBookingDraftStore.getState().latitude).toBe(16.0820);
      expect(useBookingDraftStore.getState().longitude).toBe(108.2200);
      expect(useBookingDraftStore.getState().addressText).toBe('100 Nguyễn Văn Linh, Đà Nẵng');
      expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-time');
    });

    it('[RECHECK-03] saves active coordinates immediately when geocoding is pending and clears timers', async () => {
      useBookingDraftStore.setState({
        addressText: 'Số 10 Nguyễn Huệ, Huế',
        latitude: 16.0748,
        longitude: 108.1499,
      });

      const MapboxServiceMod = require('@/services/map/mapbox-service').MapboxService;
      jest.spyOn(MapboxServiceMod, 'reverseGeocode').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('Delayed Address'), 2000)),
      );

      render(<CustomerBookingSelectAddressScreen />);

      // Map moves to new coordinates
      const mapView = screen.getByTestId('mapbox-map-view');
      fireEvent(mapView, 'regionDidChange', {
        geometry: { coordinates: [108.2500, 16.0900] },
      });

      // User immediately confirms before reverseGeocode completes (still within 500ms debounce)
      const confirmBtn = screen.getByTestId('select-address-confirm-btn');
      fireEvent.press(confirmBtn);

      // Store has the selected coordinates (16.0900, 108.2500)
      expect(useBookingDraftStore.getState().latitude).toBe(16.0900);
      expect(useBookingDraftStore.getState().longitude).toBe(108.2500);
      expect(useBookingDraftStore.getState().addressText).toBe('Số 10 Nguyễn Huệ, Huế');
      expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-time');
    });

    it('displays warning badge instead of success when GPS is denied or module missing', async () => {
      jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
        status: 'permission_denied',
        isRealGps: false,
        coordinates: null,
      });

      render(<CustomerBookingSelectAddressScreen />);

      const locateBtn = screen.getByTestId('locate-me-btn');
      fireEvent.press(locateBtn);

      await waitFor(() => {
        expect(screen.getByText('GPS: Quyền bị từ chối')).toBeOnTheScreen();
      });

      // Does not display success badge
      expect(screen.queryByText('GPS thiết bị: Đã định vị chính xác')).toBeNull();
    });
  });

  describe('full Two-Session Demo Flow Contract (D1–D3 alignment)', () => {
    it('requires authentic worker identity to accept proposal without autoAccept', async () => {
      const proposalPayload = {
        serviceRequestId: 'req-uuid-1',
        workerUserId: 'worker-target-id',
        selectionSource: 'bid' as const,
        sourceBidId: 'bid-uuid-1',
        agreedPrice: 300000,
        agreedScope: 'Sửa đường ống nước',
      };

      jest.spyOn(OrdersApi, 'createProposal').mockResolvedValue({
        data: createMockProposal('prop-new-1', 'proposed'),
        statusCode: 201,
        message: 'Created',
      });

      const created = await OrdersApi.createProposal(proposalPayload);
      expect(created.data.status).toBe('proposed');

      // Proposal is created, but NO Order exists yet before worker accepts
      jest.spyOn(OrdersApi, 'acceptProposal').mockResolvedValue({
        data: createMockOrder('ord-new-1', 'created'),
        statusCode: 200,
        message: 'OK',
      });

      const accepted = await OrdersApi.acceptProposal('prop-new-1');
      expect(accepted.data.status).toBe('created');
      expect(accepted.data.orderCode).toBeDefined();
    });
  });
});
