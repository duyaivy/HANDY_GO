import type { ServiceResponseDto } from '@/features/catalog/types';
import * as React from 'react';
import { Alert } from 'react-native';
import { CatalogApi } from '@/features/catalog/api/catalog.api';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import CustomerBookingSummaryScreen from '../summary';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/features/catalog/api/catalog.api', () => ({
  CatalogApi: { getServices: jest.fn() },
}));

jest.mock('@/features/orders/api/orders.api', () => ({
  OrdersApi: {
    createRequest: jest.fn().mockResolvedValue({ data: { id: 'req-transport' } }),
    publishRequest: jest.fn().mockResolvedValue({}),
  },
}));

const transportService: ServiceResponseDto = {
  id: '71b156ea-5c7d-4e0b-8c53-57d48cfed895',
  name: 'Bốc xếp hàng hoá',
  categoryId: 'transport-category',
  description: null,
  iconUrl: null,
  isActive: true,
  createdAt: '2026-11-20T00:00:00Z',
  updatedAt: '2026-11-20T00:00:00Z',
  category: { id: 'transport-category', name: 'Vận chuyển', imageUrl: null },
};

function mockCatalogServices(services: ServiceResponseDto[]) {
  jest.mocked(CatalogApi.getServices).mockResolvedValue({
    statusCode: 200,
    message: 'OK',
    data: { data: services, meta: { total: services.length, page: 1, limit: 100, totalPages: 1 } },
  });
}

beforeEach(() => {
  useBookingDraftStore.getState().resetDraft();
  mockCatalogServices([]);
});

afterEach(() => {
  cleanup();
  useBookingDraftStore.getState().resetDraft();
  jest.clearAllMocks();
});

it('sends the selected catalog UUID without replacing it with a cleaning service ID', async () => {
  useBookingDraftStore.getState().setService(transportService.id, transportService.name);
  render(<CustomerBookingSummaryScreen />);

  fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

  await waitFor(() => expect(OrdersApi.createRequest).toHaveBeenCalledWith(
    expect.objectContaining({ serviceId: transportService.id }),
  ));
  expect(CatalogApi.getServices).not.toHaveBeenCalled();
});

it.each([
  ['srv-boc-xep', 'Bốc xếp hàng hoá'],
  ['srv-khuan-vac', 'Khuân vác'],
  ['van-chuyen', 'Vận chuyển hàng hoá'],
])('resolves %s to its matching active catalog UUID in the request payload', async (id, name) => {
  useBookingDraftStore.getState().setService(id, name);
  mockCatalogServices([
    { ...transportService, id: '4c441301-efeb-43d1-ae58-a51a4eb90997', name: 'Dọn dẹp nhà cửa' },
    { ...transportService, name },
  ]);
  render(<CustomerBookingSummaryScreen />);

  fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

  await waitFor(() => expect(OrdersApi.createRequest).toHaveBeenCalledWith(
    expect.objectContaining({ serviceId: transportService.id }),
  ));
  expect(CatalogApi.getServices).toHaveBeenCalledWith(expect.objectContaining({ search: name, isActive: true }));
});

it.each(['Bốc xếp hàng hoá', 'Khuân vác', 'Vận chuyển hàng hoá'])(
  'blocks unsupported %s instead of creating a request for a different service',
  async (name) => {
    useBookingDraftStore.getState().setService('unsupported-service', name);
    mockCatalogServices([
      { ...transportService, id: '4c441301-efeb-43d1-ae58-a51a4eb90997', name: 'Dọn dẹp nhà cửa' },
    ]);
    render(<CustomerBookingSummaryScreen />);

    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    expect(await screen.findByText(/Dịch vụ này hiện chưa được hỗ trợ/)).toBeOnTheScreen();
    expect(OrdersApi.createRequest).not.toHaveBeenCalled();
    expect(OrdersApi.publishRequest).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  },
);

it('keeps the user on the summary when the catalog lookup fails', async () => {
  useBookingDraftStore.getState().setService('srv-boc-xep', transportService.name);
  jest.mocked(CatalogApi.getServices).mockRejectedValueOnce(new Error('Catalog unavailable'));
  render(<CustomerBookingSummaryScreen />);

  fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

  expect(await screen.findByText(/Không thể tạo yêu cầu/)).toBeOnTheScreen();
  expect(OrdersApi.createRequest).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

it('renders reference price range and estimated reason badge correctly', () => {
  useBookingDraftStore.setState({
    aiRefPriceMin: 250000,
    aiRefPriceMax: 450000,
    priceEstimateReason: 'Vệ sinh và bảo dưỡng cơ bản',
  });

  render(<CustomerBookingSummaryScreen />);

  expect(screen.getByText(/250\.000.*đ.*-.*450\.000.*đ/)).toBeOnTheScreen();
  expect(screen.getByText(/Phù hợp: Vệ sinh và bảo dưỡng cơ bản/)).toBeOnTheScreen();
});

it('waits for in-flight price estimation before submitting booking and uses estimated prices', async () => {
  let resolveEstimate: () => void;
  const estimatePromise = new Promise<void>((resolve) => {
    resolveEstimate = resolve;
  });

  useBookingDraftStore.getState().setService(transportService.id, transportService.name);
  useBookingDraftStore.setState({
    isEstimatingPrice: true,
    waitForEstimate: jest.fn().mockImplementation(() => estimatePromise),
  });

  render(<CustomerBookingSummaryScreen />);
  expect(screen.getByText('Đang tính toán...')).toBeOnTheScreen();

  fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

  // Update store as if estimate resolved
  act(() => {
    useBookingDraftStore.setState({
      aiRefPriceMin: 320000,
      aiRefPriceMax: 650000,
      isEstimatingPrice: false,
    });
  });
  resolveEstimate!();

  await waitFor(() => expect(OrdersApi.createRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      serviceId: transportService.id,
      aiRefPriceMin: 320000,
      aiRefPriceMax: 650000,
    }),
  ));
});

it('submits with valid fallback prices when price estimation fails or times out', async () => {
  useBookingDraftStore.getState().setService(transportService.id, transportService.name);
  useBookingDraftStore.setState({
    isEstimatingPrice: true,
    waitForEstimate: jest.fn().mockRejectedValue(new Error('Network failure')),
  });

  render(<CustomerBookingSummaryScreen />);
  fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

  await waitFor(() => expect(OrdersApi.createRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      serviceId: transportService.id,
      aiRefPriceMin: 150000,
      aiRefPriceMax: 350000,
    }),
  ));
});

describe('HG96-REM-05: Backend Price Synchronization & Confirmation', () => {
  it('synchronizes backend authoritative price and prompts customer when server price differs from preview', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    useBookingDraftStore.getState().setService(transportService.id, transportService.name);
    useBookingDraftStore.setState({
      aiRefPriceMin: 200000,
      aiRefPriceMax: 350000,
      priceEstimateReason: 'ước tính xem trước',
    });

    jest.mocked(OrdersApi.createRequest).mockResolvedValueOnce({
      statusCode: 201,
      message: 'Created',
      data: {
        id: 'req-server-diff',
        aiRefPriceMin: '150000',
        aiRefPriceMax: '450000',
      } as any,
    });

    render(<CustomerBookingSummaryScreen />);
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Cập nhật khoảng giá tham khảo',
        expect.stringContaining('150.000đ - 450.000đ'),
        expect.any(Array),
        { cancelable: false },
      );
    });

    // Check store synchronization
    const updatedStore = useBookingDraftStore.getState();
    expect(updatedStore.aiRefPriceMin).toBe(150000);
    expect(updatedStore.aiRefPriceMax).toBe(450000);
    expect(updatedStore.priceEstimateReason).toBeNull();

    // Customer confirms and proceeds to find worker
    const alertButtons = alertSpy.mock.calls[0][2] as any[];
    const confirmButton = alertButtons.find(b => b.text === 'Tiếp tục tìm thợ');
    expect(confirmButton).toBeDefined();

    await act(async () => {
      await confirmButton.onPress();
    });

    expect(OrdersApi.publishRequest).toHaveBeenCalledWith('req-server-diff');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/booking/radar',
      params: { requestId: 'req-server-diff', serviceName: transportService.name },
    });
  });

  it('publishes and navigates directly without alert when server price matches preview', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    useBookingDraftStore.getState().setService(transportService.id, transportService.name);
    useBookingDraftStore.setState({
      aiRefPriceMin: 200000,
      aiRefPriceMax: 350000,
    });

    jest.mocked(OrdersApi.createRequest).mockResolvedValueOnce({
      statusCode: 201,
      message: 'Created',
      data: {
        id: 'req-same-price',
        aiRefPriceMin: 200000,
        aiRefPriceMax: 350000,
      } as any,
    });

    render(<CustomerBookingSummaryScreen />);
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(OrdersApi.publishRequest).toHaveBeenCalledWith('req-same-price');
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/booking/radar',
      params: { requestId: 'req-same-price', serviceName: transportService.name },
    });
  });

  it('retries publishing without creating duplicate request when initial publish fails', async () => {
    useBookingDraftStore.getState().setService(transportService.id, transportService.name);

    jest.mocked(OrdersApi.createRequest).mockResolvedValueOnce({
      statusCode: 201,
      message: 'Created',
      data: {
        id: 'req-fail-publish',
        aiRefPriceMin: 150000,
        aiRefPriceMax: 350000,
      } as any,
    });
    jest.mocked(OrdersApi.publishRequest).mockRejectedValueOnce(new Error('Network error on publish'));

    render(<CustomerBookingSummaryScreen />);
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(screen.getByText('Yêu cầu đã được tạo nhưng chưa thể tìm thợ. Vui lòng bấm Tìm thợ ngay để thử lại.')).toBeOnTheScreen();
    });

    expect(OrdersApi.createRequest).toHaveBeenCalledTimes(1);

    // Second click: retry publish on existing draft
    jest.mocked(OrdersApi.publishRequest).mockResolvedValueOnce({
      statusCode: 200,
      message: 'Published',
      data: { id: 'req-fail-publish' } as any,
    });
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(OrdersApi.publishRequest).toHaveBeenCalledTimes(2);
    });
    expect(OrdersApi.publishRequest).toHaveBeenLastCalledWith('req-fail-publish');

    // Still only created once (no duplicate requests)
    expect(OrdersApi.createRequest).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/booking/radar',
      params: { requestId: 'req-fail-publish', serviceName: transportService.name },
    });
  });
});
