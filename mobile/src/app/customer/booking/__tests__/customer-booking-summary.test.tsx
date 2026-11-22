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
    updateRequest: jest.fn().mockResolvedValue({ data: { id: 'req-transport' } }),
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

    let finishPublish!: () => void;
    jest.mocked(OrdersApi.publishRequest).mockImplementationOnce(() => new Promise((resolve) => {
      finishPublish = () => resolve({} as any);
    }));
    await act(async () => {
      await confirmButton.onPress();
    });

    expect(screen.getByTestId('booking-start-finding-btn')).toBeDisabled();
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));
    await act(async () => {
      await confirmButton.onPress();
    });
    expect(OrdersApi.publishRequest).toHaveBeenCalledTimes(1);
    await act(async () => finishPublish());

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

  it('does not publish when user selects "Xem lại", and requires confirmation again on next submit (Scenario A)', async () => {
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
        id: 'req-scen-a',
        aiRefPriceMin: 150000,
        aiRefPriceMax: 450000,
      } as any,
    });

    render(<CustomerBookingSummaryScreen />);
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    // Customer clicks "Xem lại"
    const alertButtons = alertSpy.mock.calls[0][2] as any[];
    const reviewButton = alertButtons.find(b => b.text === 'Xem lại');
    expect(reviewButton).toBeDefined();

    act(() => {
      reviewButton.onPress();
    });

    // Should NOT publish
    expect(OrdersApi.publishRequest).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(useBookingDraftStore.getState().isPriceConfirmed).toBe(false);

    // Second click: Customer clicks "Tìm thợ ngay" again without changing anything
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    // Alert MUST be displayed again to confirm price before publish
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(2);
    });
    expect(OrdersApi.publishRequest).not.toHaveBeenCalled();

    // Now customer confirms
    const secondAlertButtons = alertSpy.mock.calls[1][2] as any[];
    const confirmButton = secondAlertButtons.find(b => b.text === 'Tiếp tục tìm thợ');
    expect(confirmButton).toBeDefined();

    await act(async () => {
      await confirmButton.onPress();
    });

    expect(OrdersApi.publishRequest).toHaveBeenCalledWith('req-scen-a');
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/booking/radar',
      params: { requestId: 'req-scen-a', serviceName: transportService.name },
    });
  });

  it('synchronizes modified description via updateRequest before publishing (Scenario B)', async () => {
    useBookingDraftStore.getState().setService(transportService.id, transportService.name);
    useBookingDraftStore.setState({
      description: 'Mô tả ban đầu',
      aiRefPriceMin: 200000,
      aiRefPriceMax: 350000,
    });

    jest.mocked(OrdersApi.createRequest).mockResolvedValueOnce({
      statusCode: 201,
      message: 'Created',
      data: {
        id: 'req-scen-b1',
        description: 'Tôi cần người Bốc xếp hàng hoá: Mô tả ban đầu',
        aiRefPriceMin: 200000,
        aiRefPriceMax: 350000,
      } as any,
    });

    const { rerender } = render(<CustomerBookingSummaryScreen />);

    // Step 1: Initial create draft
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));
    await waitFor(() => {
      expect(OrdersApi.createRequest).toHaveBeenCalledTimes(1);
    });

    // Step 2: Customer modifies description
    act(() => {
      useBookingDraftStore.getState().setDescription('Mô tả mới đã chỉnh sửa chi tiết');
    });
    rerender(<CustomerBookingSummaryScreen />);

    jest.mocked(OrdersApi.updateRequest).mockResolvedValueOnce({
      statusCode: 200,
      message: 'Updated',
      data: {
        id: 'req-scen-b1',
        description: 'Tôi cần người Bốc xếp hàng hoá: Mô tả mới đã chỉnh sửa chi tiết',
        aiRefPriceMin: 200000,
        aiRefPriceMax: 350000,
      } as any,
    });

    // Step 3: Customer presses start finding again
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(OrdersApi.updateRequest).toHaveBeenCalledWith(
        'req-scen-b1',
        expect.objectContaining({
          description: expect.stringContaining('Mô tả mới đã chỉnh sửa chi tiết'),
        }),
      );
    });

    // Published with updated data
    expect(OrdersApi.publishRequest).toHaveBeenCalledWith('req-scen-b1');
    expect(OrdersApi.createRequest).toHaveBeenCalledTimes(1); // No duplicate create
  });

  it('synchronizes updated serviceId via updateRequest and recalculates server price', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    useBookingDraftStore.getState().setService(transportService.id, transportService.name);
    useBookingDraftStore.setState({
      createdRequestId: 'req-service-change',
      lastSyncedDraftSnapshot: JSON.stringify({
        serviceId: transportService.id,
        description: 'Tôi cần người Bốc xếp hàng hoá',
        addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
        scheduledAt: '2026-11-25T09:00:00.000Z',
        media: [],
      }),
      scheduledAt: '2026-11-25T09:00:00.000Z',
      aiRefPriceMin: 200000,
      aiRefPriceMax: 350000,
      isPriceConfirmed: true,
    });

    // User changes service to another valid service
    const newServiceId = 'cbb1b85c-32f9-4041-a0fd-df5cde04784f';
    useBookingDraftStore.getState().setService(newServiceId, 'Sửa điều hoà');

    jest.mocked(OrdersApi.updateRequest).mockResolvedValueOnce({
      statusCode: 200,
      message: 'Updated',
      data: {
        id: 'req-service-change',
        serviceId: newServiceId,
        aiRefPriceMin: 350000,
        aiRefPriceMax: 600000, // New recalculated price
      } as any,
    });

    render(<CustomerBookingSummaryScreen />);
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(OrdersApi.updateRequest).toHaveBeenCalledWith(
        'req-service-change',
        expect.objectContaining({ serviceId: newServiceId }),
      );
    });

    // Price changed -> Alert shown
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Cập nhật khoảng giá tham khảo',
        expect.stringContaining('350.000đ - 600.000đ'),
        expect.any(Array),
        { cancelable: false },
      );
    });
  });

  it('synchronizes updated address and scheduled time without creating duplicate draft', async () => {
    useBookingDraftStore.getState().setService(transportService.id, transportService.name);
    useBookingDraftStore.setState({
      createdRequestId: 'req-sync-address',
      lastSyncedDraftSnapshot: JSON.stringify({
        serviceId: transportService.id,
        description: 'Tôi cần người Bốc xếp hàng hoá',
        addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
        scheduledAt: '2026-11-25T09:00:00.000Z',
        media: [],
      }),
      scheduledAt: '2026-11-25T09:00:00.000Z',
      aiRefPriceMin: 200000,
      aiRefPriceMax: 350000,
      isPriceConfirmed: true,
    });

    // User changes address
    useBookingDraftStore.getState().setAddress('999 Nguyễn Văn Linh, Đà Nẵng', 16.06, 108.22);

    jest.mocked(OrdersApi.updateRequest).mockResolvedValueOnce({
      statusCode: 200,
      message: 'Updated',
      data: {
        id: 'req-sync-address',
        addressText: '999 Nguyễn Văn Linh, Đà Nẵng',
        aiRefPriceMin: 200000,
        aiRefPriceMax: 350000,
      } as any,
    });

    render(<CustomerBookingSummaryScreen />);
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(OrdersApi.updateRequest).toHaveBeenCalledWith(
        'req-sync-address',
        expect.objectContaining({
          addressText: '999 Nguyễn Văn Linh, Đà Nẵng',
          latitude: 16.06,
          longitude: 108.22,
        }),
      );
    });

    expect(OrdersApi.publishRequest).toHaveBeenCalledWith('req-sync-address');
    expect(OrdersApi.createRequest).not.toHaveBeenCalled();
  });

  it('stops flow and does not publish stale draft when updateRequest fails', async () => {
    useBookingDraftStore.getState().setService(transportService.id, transportService.name);
    useBookingDraftStore.setState({
      createdRequestId: 'req-fail-update',
      lastSyncedDraftSnapshot: JSON.stringify({
        serviceId: transportService.id,
        description: 'Mô tả cũ',
        addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
        scheduledAt: '2026-11-25T09:00:00.000Z',
        media: [],
      }),
      scheduledAt: '2026-11-25T09:00:00.000Z',
      description: 'Mô tả mới',
    });

    jest.mocked(OrdersApi.updateRequest).mockRejectedValueOnce(new Error('Internal server error on update'));

    render(<CustomerBookingSummaryScreen />);
    fireEvent.press(screen.getByTestId('booking-start-finding-btn'));

    await waitFor(() => {
      expect(screen.getByText('Không thể cập nhật yêu cầu. Vui lòng thử lại sau.')).toBeOnTheScreen();
    });

    expect(OrdersApi.publishRequest).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks duplicate submissions when start finding button is pressed repeatedly', async () => {
    let resolveCreate: (value: any) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });

    useBookingDraftStore.getState().setService(transportService.id, transportService.name);
    jest.mocked(OrdersApi.createRequest).mockImplementation(() => createPromise as any);

    render(<CustomerBookingSummaryScreen />);
    const submitBtn = screen.getByTestId('booking-start-finding-btn');

    // First click initiates submission
    fireEvent.press(submitBtn);

    await waitFor(() => {
      expect(OrdersApi.createRequest).toHaveBeenCalledTimes(1);
    });

    // Subsequent clicks while in flight should be blocked by isSubmitting
    fireEvent.press(submitBtn);
    fireEvent.press(submitBtn);

    expect(OrdersApi.createRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate!({
        statusCode: 201,
        data: {
          id: 'req-rapid-click',
          aiRefPriceMin: 150000,
          aiRefPriceMax: 350000,
        },
      });
    });
  });

  it('clears price confirmation and synced snapshot state upon resetDraft', () => {
    useBookingDraftStore.setState({
      createdRequestId: 'req-to-reset',
      isPriceConfirmed: true,
      lastSyncedDraftSnapshot: '{"serviceId":"xyz"}',
    });

    useBookingDraftStore.getState().resetDraft();

    const state = useBookingDraftStore.getState();
    expect(state.createdRequestId).toBeNull();
    expect(state.isPriceConfirmed).toBe(false);
    expect(state.lastSyncedDraftSnapshot).toBeNull();
  });
});
