import * as React from 'react';
import { Alert, Linking } from 'react-native';
import { CatalogApi } from '@/features/catalog/api/catalog.api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { OrdersApi } from '../../api/orders.api';
import { CustomerOrderDetailScreen } from '../screens/customer-order-detail-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'ord-test-001' })),
}));

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  jest.spyOn(OrdersApi, 'getStatusHistory').mockResolvedValue({
    data: [],
    statusCode: 200,
    message: 'OK',
  } as any);
});

afterEach(() => {
  cleanup();
  useAuthStore.setState(initialAuthState, true);
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('customerOrderDetailScreen redesign (TASK-08)', () => {
  const baseOrder = {
    id: 'ord-test-001',
    orderCode: 'ORD-TEST-001',
    serviceRequestId: 'req-01',
    customerUserId: 'cust-1',
    workerUserId: 'worker-uuid-123',
    workerName: 'Nguyễn Văn Thợ',
    worker: {
      fullName: 'Nguyễn Văn Thợ',
      phone: '0905123456',
      rating: 4.9,
      completedJobsCount: 150,
      headline: 'Chuyên gia điện nước 10 năm kinh nghiệm',
    },
    service: {
      name: 'Sửa đường ống nước âm tường',
    },
    agreedPrice: 450000,
    agreedScope: 'Thay thế 2 van khóa nước và nối ống PPR',
    addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
    status: 'in_progress',
    paymentState: 'unpaid',
    evidences: [
      {
        id: 'ev-1',
        orderId: 'ord-test-001',
        mediaType: 'image',
        mediaUrl: 'https://example.com/evidence1.jpg',
        description: 'Đã hoàn tất nối ống PPR',
        createdAt: '2026-11-05T08:00:00Z',
      },
      {
        id: 'ev-2',
        orderId: 'ord-test-001',
        mediaType: 'image',
        mediaUrl: 'https://example.com/evidence2.jpg',
        description: 'Kiểm tra áp lực nước không rò rỉ',
        createdAt: '2026-11-05T08:15:00Z',
      },
    ],
    statusHistory: [
      {
        id: 'h-1',
        orderId: 'ord-test-001',
        fromStatus: null,
        toStatus: 'created',
        createdAt: '2026-11-05T07:30:00Z',
      },
      {
        id: 'h-2',
        orderId: 'ord-test-001',
        fromStatus: 'created',
        toStatus: 'confirmed',
        createdAt: '2026-11-05T07:35:00Z',
      },
      {
        id: 'h-3',
        orderId: 'ord-test-001',
        fromStatus: 'confirmed',
        toStatus: 'in_progress',
        createdAt: '2026-11-05T07:45:00Z',
      },
    ],
    createdAt: '2026-11-05T07:30:00Z',
  };

  it('renders complete redesigned screen with hero stepper, worker card pro, service card, invoice card, and timeline', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: baseOrder,
      statusCode: 200,
      message: 'OK',
    } as any);
    jest.spyOn(OrdersApi, 'getStatusHistory').mockResolvedValue({
      data: baseOrder.statusHistory,
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      // AppBar
      expect(screen.getByText('Chi tiết đơn hàng')).toBeOnTheScreen();
      expect(screen.getByText('Mã đơn: #ORD-TEST-001')).toBeOnTheScreen();

      // 1. Stepper & Hero Banner
      expect(screen.getByText('Thợ đang tiến hành thi công')).toBeOnTheScreen();
      expect(screen.getByText('Đã đặt')).toBeOnTheScreen();
      expect(screen.getByText('Nhận việc')).toBeOnTheScreen();
      expect(screen.getByText('Thi công')).toBeOnTheScreen();
      expect(screen.getByText('Nghiệm thu')).toBeOnTheScreen();
      expect(screen.getByText('Hoàn tất')).toBeOnTheScreen();

      // 2. Worker Card Pro
      expect(screen.getByTestId('worker-quote-section')).toBeOnTheScreen();
      expect(screen.getByText('Nguyễn Văn Thợ')).toBeOnTheScreen();
      expect(screen.getByText('4.9')).toBeOnTheScreen();
      expect(screen.getByText('Gọi điện')).toBeOnTheScreen();
      expect(screen.getByText('Nhắn tin')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-profile-btn')).toBeOnTheScreen();

      // 3. Service Card
      expect(screen.getByText('Sửa đường ống nước âm tường')).toBeOnTheScreen();
      expect(screen.getByText('123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng')).toBeOnTheScreen();
      expect(screen.getByText('Thay thế 2 van khóa nước và nối ống PPR')).toBeOnTheScreen();

      // 4. Invoice & Payment Card
      expect(screen.getByText('Chi phí & Thanh toán')).toBeOnTheScreen();
      expect(screen.getAllByText('450.000đ').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('TỔNG THANH TOÁN')).toBeOnTheScreen();

      // 5. Evidence Gallery
      expect(screen.getByText('📷 Bằng chứng hoàn thành do Thợ nộp:')).toBeOnTheScreen();

      // 6. Timeline
      expect(screen.getByText('Lịch sử trạng thái đơn hàng')).toBeOnTheScreen();

      // 7. Hidden backwards-compatibility placeholder
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
    });
  });

  it('triggers phone calling when pressing Gọi điện button', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: baseOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    const canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Thợ')).toBeOnTheScreen();
      expect(screen.getByText('Gọi điện')).toBeOnTheScreen();
    });

    const callBtn = screen.getByText('Gọi điện');
    fireEvent.press(callBtn);

    await waitFor(() => {
      expect(canOpenSpy).toHaveBeenCalledWith('tel:0905123456');
      expect(openSpy).toHaveBeenCalledWith('tel:0905123456');
    });
  });

  it('navigates to chat when pressing Nhắn tin button', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: baseOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn Thợ')).toBeOnTheScreen();
      expect(screen.getByText('Nhắn tin')).toBeOnTheScreen();
    });

    const chatBtn = screen.getByText('Nhắn tin');
    fireEvent.press(chatBtn);

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/customer/chat',
        params: expect.objectContaining({
          workerId: 'worker-uuid-123',
          workerName: 'Nguyễn Văn Thợ',
        }),
      }),
    );
  });

  it('opens and closes evidence image Lightbox modal on tap', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: baseOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByText('📷 Bằng chứng hoàn thành do Thợ nộp:')).toBeOnTheScreen();
    });

    const thumbnail = screen.getByLabelText('Bằng chứng ảnh 1');
    fireEvent.press(thumbnail);

    // Modal opens showing image counter & description
    expect(screen.getByText('Ảnh 1 / 2')).toBeOnTheScreen();
    expect(screen.getByText('Đã hoàn tất nối ống PPR')).toBeOnTheScreen();

    // Close modal
    const closeBtn = screen.getByLabelText('Đóng xem ảnh');
    fireEvent.press(closeBtn);

    expect(screen.queryByText('Ảnh 1 / 2')).toBeNull();
  });

  it('renders awaiting_customer_confirmation status and handles Confirm Completion & Request Rework', async () => {
    const awaitingOrder = {
      ...baseOrder,
      status: 'awaiting_customer_confirmation',
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: awaitingOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    const confirmCompletionSpy = jest.spyOn(OrdersApi, 'confirmCompletion').mockResolvedValue({
      data: { ...awaitingOrder, status: 'completed' },
      statusCode: 200,
      message: 'OK',
    } as any);

    const requestReworkSpy = jest.spyOn(OrdersApi, 'requestRework').mockResolvedValue({
      data: { ...awaitingOrder, status: 'in_progress' },
      statusCode: 200,
      message: 'OK',
    } as any);

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByText('Thợ đã hoàn thành công việc')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-confirm-completion-btn')).toBeOnTheScreen();
      expect(screen.getByTestId('customer-request-rework-btn')).toBeOnTheScreen();
    });

    // Press Confirm Completion
    const confirmBtn = screen.getByTestId('customer-confirm-completion-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(confirmCompletionSpy).toHaveBeenCalledWith('ord-test-001');
      expect(alertSpy).toHaveBeenCalledWith('Thành công', 'Đã nghiệm thu hoàn tất đơn hàng!');
    });

    // Press Request Rework
    const reworkBtn = screen.getByTestId('customer-request-rework-btn');
    fireEvent.press(reworkBtn);

    await waitFor(() => {
      expect(requestReworkSpy).toHaveBeenCalledWith(
        'ord-test-001',
        'Cần thợ kiểm tra lại phần mối nối còn rò rỉ nước.',
      );
    });
  });

  it('handles Cancel Order when order is in created status', async () => {
    const createdOrder = {
      ...baseOrder,
      status: 'created',
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: createdOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    const cancelOrderSpy = jest.spyOn(OrdersApi, 'cancelOrder').mockResolvedValue({
      data: { ...createdOrder, status: 'cancelled' },
      statusCode: 200,
      message: 'OK',
    } as any);

    let cancelAlertButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => {
      if (title === 'Hủy đơn hàng' && buttons) {
        cancelAlertButtons = buttons;
      }
    });

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('customer-cancel-order-btn')).toBeOnTheScreen();
    });

    const cancelBtn = screen.getByTestId('customer-cancel-order-btn');
    fireEvent.press(cancelBtn);

    expect(cancelAlertButtons.length).toBeGreaterThan(0);
    const confirmAction = cancelAlertButtons.find(b => b.text === 'Xác nhận hủy');
    expect(confirmAction).toBeDefined();

    await act(async () => {
      await confirmAction.onPress();
    });

    expect(cancelOrderSpy).toHaveBeenCalledWith('ord-test-001', 'Khách hàng yêu cầu hủy đơn');
  });

  it('renders cancelled order banner with reason and cancelled timestamp', async () => {
    const cancelledOrder = {
      ...baseOrder,
      status: 'cancelled',
      cancelledAt: '2026-11-05T09:00:00Z',
      cancelReason: 'Tôi bận việc đột xuất không thể đón thợ',
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: cancelledOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByText('Đơn hàng đã được hủy')).toBeOnTheScreen();
      expect(screen.getByText('Tôi bận việc đột xuất không thể đón thợ')).toBeOnTheScreen();
      expect(screen.getByText('Đặt Dịch Vụ Mới')).toBeOnTheScreen();
    });
  });

  it('renders disputed order banner and emergency support button', async () => {
    const disputedOrder = {
      ...baseOrder,
      status: 'disputed',
      disputedAt: '2026-11-05T09:30:00Z',
      disputeReason: 'Thợ làm vỡ bồn rửa chén nhưng không chịu bồi thường',
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: disputedOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByText('Đơn hàng đang trong quá trình khiếu nại')).toBeOnTheScreen();
      expect(screen.getByText('Thợ làm vỡ bồn rửa chén nhưng không chịu bồi thường')).toBeOnTheScreen();
      expect(screen.getByText('Liên Hệ Hỗ Trợ Khẩn Cấp')).toBeOnTheScreen();
    });
  });

  it('resolves and displays real worker data from bid detail when order has selectedBidId', async () => {
    const orderWithoutWorker = {
      ...baseOrder,
      worker: undefined,
      workerName: undefined,
      selectedBidId: 'bid-real-999',
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: orderWithoutWorker,
      statusCode: 200,
      message: 'OK',
    } as any);

    const getBidSpy = jest.spyOn(OrdersApi, 'getBidDetail').mockResolvedValue({
      data: {
        id: 'bid-real-999',
        workerProfile: {
          fullName: 'Trần Văn Thực Tế',
          avatarUrl: 'https://example.com/real-avatar.jpg',
          averageRating: 4.9,
          completedOrderCount: 42,
          phoneNumber: '0988776655',
        },
      },
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(getBidSpy).toHaveBeenCalled();
      expect(screen.getByText('Trần Văn Thực Tế')).toBeOnTheScreen();
      expect(screen.getByText('4.9')).toBeOnTheScreen();
      expect(screen.getByText(/42 đơn thành công/)).toBeOnTheScreen();
    });
  });

  it('P1-02: does not display fake sample phone number, rating, or completion percentage when worker metadata is missing', async () => {
    const orderWithIncompleteWorker = {
      ...baseOrder,
      workerUserId: 'worker-no-phone',
      workerName: 'Thợ Không Số',
      worker: {
        fullName: 'Thợ Không Số',
        // phone and rating are undefined
        phone: undefined,
        rating: undefined,
        completedJobsCount: undefined,
      },
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: orderWithIncompleteWorker,
      statusCode: 200,
      message: 'OK',
    } as any);

    const openSpy = jest.spyOn(Linking, 'openURL');
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByText('Thợ Không Số')).toBeOnTheScreen();
      // Should show 'Chưa có đánh giá', not 5.0
      expect(screen.getByText('Chưa có đánh giá')).toBeOnTheScreen();
      expect(screen.queryByText('5.0')).toBeNull();
      // Should not show fake 98% hoàn thành
      expect(screen.queryByText(/98% hoàn thành/)).toBeNull();
      // Should display 'Chưa có số'
      expect(screen.getByText('Chưa có số')).toBeOnTheScreen();
    });

    const callBtn = screen.getByLabelText('Gọi điện cho thợ');
    fireEvent.press(callBtn);

    expect(openSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Thông báo', 'Thợ chưa cập nhật số điện thoại.');
  });

  it('P1-04: displays error alert when confirmCompletion or requestRework rejects and does not show success alert', async () => {
    const awaitingOrder = {
      ...baseOrder,
      status: 'awaiting_customer_confirmation',
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: awaitingOrder,
      statusCode: 200,
      message: 'OK',
    } as any);

    const confirmCompletionSpy = jest.spyOn(OrdersApi, 'confirmCompletion').mockRejectedValue(
      new Error('Lỗi máy chủ 500 khi nghiệm thu'),
    );
    const requestReworkSpy = jest.spyOn(OrdersApi, 'requestRework').mockRejectedValue(
      new Error('Lỗi mạng khi yêu cầu sửa lại'),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(screen.getByTestId('customer-confirm-completion-btn')).toBeOnTheScreen();
    });

    // Press Confirm Completion -> API fails
    fireEvent.press(screen.getByTestId('customer-confirm-completion-btn'));

    await waitFor(() => {
      expect(confirmCompletionSpy).toHaveBeenCalledWith('ord-test-001');
      expect(alertSpy).toHaveBeenCalledWith('Lỗi nghiệm thu', 'Lỗi máy chủ 500 khi nghiệm thu');
      expect(alertSpy).not.toHaveBeenCalledWith('Thành công', expect.anything());
    });

    // Press Request Rework -> API fails
    fireEvent.press(screen.getByTestId('customer-request-rework-btn'));

    await waitFor(() => {
      expect(requestReworkSpy).toHaveBeenCalledWith(
        'ord-test-001',
        'Cần thợ kiểm tra lại phần mối nối còn rò rỉ nước.',
      );
      expect(alertSpy).toHaveBeenCalledWith('Lỗi yêu cầu sửa lại', 'Lỗi mạng khi yêu cầu sửa lại');
      expect(alertSpy).not.toHaveBeenCalledWith('Đã gửi yêu cầu', expect.anything());
    });
  });

  it('P2-04: resolves worker profile from AI recommendation candidates when order lacks selectedBidId', async () => {
    const orderFromRecommendation = {
      ...baseOrder,
      worker: undefined,
      workerName: undefined,
      selectedBidId: undefined,
      serviceRequestId: 'req-rec-001',
      workerUserId: 'worker-ai-rec-456',
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: orderFromRecommendation,
      statusCode: 200,
      message: 'OK',
    } as any);

    const getCandidatesSpy = jest.spyOn(OrdersApi, 'getCandidates').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        requestId: 'req-rec-001',
        requestStatus: 'converted_to_order',
        matching: {
          recommendations: [
            {
              selectionSource: 'recommendation',
              workerUserId: 'worker-ai-rec-456',
              workerId: 'worker-ai-rec-456',
              workerProfile: {
                fullName: 'Lê Hoàng Đề Xuất',
                avatarUrl: 'https://example.com/rec-avatar.jpg',
                averageRating: 4.8,
                completedOrderCount: 77,
                phoneNumber: '0977889900',
              },
            },
          ],
        },
      },
    } as any);

    render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

    await waitFor(() => {
      expect(getCandidatesSpy).toHaveBeenCalledWith('req-rec-001');
      expect(screen.getByText('Lê Hoàng Đề Xuất')).toBeOnTheScreen();
      expect(screen.getByText('4.8')).toBeOnTheScreen();
      expect(screen.getByText(/77 đơn thành công/)).toBeOnTheScreen();
    });
  });

  describe('service Name Resolution (PR62-02-P2 / ORD-11)', () => {
    it('P2-01: resolves service name from serviceId when Order API does not return serviceName or service', async () => {
      const orderWithoutServiceName = {
        ...baseOrder,
        service: undefined,
        serviceName: undefined,
        serviceId: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4', // Vệ sinh máy lạnh
      };

      jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
        data: orderWithoutServiceName,
        statusCode: 200,
        message: 'OK',
      } as any);

      render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

      await waitFor(() => {
        expect(screen.getByText('Vệ sinh máy lạnh')).toBeOnTheScreen();
        expect(screen.queryByText('Dịch vụ tiện ích')).toBeNull();
      });
    });

    it('P2-02: prioritizes valid service name returned from server over serviceId dictionary lookup', async () => {
      const orderWithServerName = {
        ...baseOrder,
        service: {
          name: 'Vệ sinh máy lạnh Panasonic Inverter',
        },
        serviceId: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4',
      };

      jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
        data: orderWithServerName,
        statusCode: 200,
        message: 'OK',
      } as any);

      render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

      await waitFor(() => {
        expect(screen.getByText('Vệ sinh máy lạnh Panasonic Inverter')).toBeOnTheScreen();
        expect(screen.queryByText('Vệ sinh máy lạnh')).toBeNull();
      });
    });

    it('P2-03: fetches service name from CatalogApi when serviceId is not in fixed dictionary', async () => {
      const orderWithUnknownServiceId = {
        ...baseOrder,
        service: undefined,
        serviceName: undefined,
        serviceId: 'custom-catalog-uuid-777',
      };

      jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
        data: orderWithUnknownServiceId,
        statusCode: 200,
        message: 'OK',
      } as any);

      jest.spyOn(CatalogApi, 'getServiceById').mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'custom-catalog-uuid-777',
          name: 'Dịch vụ diệt côn trùng tận gốc',
          categoryId: 'cat-1',
          description: null,
          iconUrl: null,
          isActive: true,
          createdAt: '2026-11-05T00:00:00Z',
          updatedAt: '2026-11-05T00:00:00Z',
          category: { id: 'cat-1', name: 'Vệ sinh', imageUrl: null },
        },
      });

      render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

      await waitFor(() => {
        expect(screen.getByText('Dịch vụ diệt côn trùng tận gốc')).toBeOnTheScreen();
        expect(screen.queryByText('Dịch vụ tiện ích')).toBeNull();
      });
    });

    it('P2-04: safely falls back to default when serviceId is unknown and CatalogApi fails', async () => {
      const orderWithUnknownServiceId = {
        ...baseOrder,
        service: undefined,
        serviceName: undefined,
        serviceId: 'unknown-uuid-404',
        agreedScope: undefined,
      };

      jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
        data: orderWithUnknownServiceId,
        statusCode: 200,
        message: 'OK',
      } as any);

      jest.spyOn(CatalogApi, 'getServiceById').mockRejectedValue(new Error('Service not found'));

      render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

      await waitFor(() => {
        expect(screen.getByText('Dịch vụ tiện ích')).toBeOnTheScreen();
      });
    });

    it('P2-05: ignores empty string or generic label from server and resolves specific name via serviceId', async () => {
      const orderWithGenericServerName = {
        ...baseOrder,
        service: undefined,
        serviceName: 'Dịch vụ tiện ích',
        serviceId: '34ec7df5-20db-401e-804a-6feee5b48184', // Sửa máy lạnh
      };

      jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
        data: orderWithGenericServerName,
        statusCode: 200,
        message: 'OK',
      } as any);

      render(<CustomerOrderDetailScreen orderId="ord-test-001" />);

      await waitFor(() => {
        expect(screen.getByText('Sửa máy lạnh')).toBeOnTheScreen();
      });
    });

    it('P2-06: respects propServiceName when it belongs to current order and server has no specific name', async () => {
      const orderWithoutSpecificName = {
        ...baseOrder,
        service: undefined,
        serviceName: undefined,
        serviceId: undefined,
        agreedScope: undefined,
      };

      jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
        data: orderWithoutSpecificName,
        statusCode: 200,
        message: 'OK',
      } as any);

      render(
        <CustomerOrderDetailScreen
          orderId="ord-test-001"
          serviceName="Chăm sóc cây cảnh ban công"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Chăm sóc cây cảnh ban công')).toBeOnTheScreen();
      });
    });
  });
});
