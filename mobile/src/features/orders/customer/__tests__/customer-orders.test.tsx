import * as ImagePicker from 'expo-image-picker';
import * as React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { OrdersApi } from '../../api/orders.api';
import { useBookingDraftStore } from '../../stores/use-booking-draft-store';
import { CustomerBookingScreen } from '../screens/customer-booking-screen';
import { CustomerOrderCancelDialog } from '../screens/customer-order-cancel-dialog';
import { CustomerOrderDetailScreen } from '../screens/customer-order-detail-screen';
import { CustomerOrdersScreen } from '../screens/customer-orders-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'demo-001' })),
}));

const initialAuthState = useAuthStore.getState();

afterEach(() => {
  cleanup();
  useAuthStore.setState(initialAuthState, true);
  useBookingDraftStore.getState().resetDraft();
  delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('customerOrdersScreen and CustomerOrderDetailScreen', () => {
  it('renders CustomerOrdersScreen with title and placeholder text', () => {
    render(<CustomerOrdersScreen />);
    expect(screen.getByText('Hoạt động')).toBeOnTheScreen();
    expect(screen.getByTestId('orders-customer-screen')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
  });

  it('renders CustomerOrderDetailScreen displaying orderId passed as prop and placeholder text', () => {
    render(<CustomerOrderDetailScreen orderId="demo-001" />);
    expect(screen.getByText('Báo giá thợ')).toBeOnTheScreen();
    expect(screen.getByText('Mã đơn: #demo-001')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
  });

  it('navigates back when pressing back button in detail screen app bar', () => {
    render(<CustomerOrderDetailScreen orderId="demo-001" />);
    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders CustomerBookingScreen and handles photo attachment and next navigation', () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(<CustomerBookingScreen serviceId="srv-01" />);

    expect(screen.getByText('Mô tả sự cố')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-booking-screen')).toBeOnTheScreen();

    const addPhotoBtn = screen.getByTestId('booking-add-photo-btn');
    fireEvent.press(addPhotoBtn);

    const nextBtn = screen.getByTestId('booking-next-btn');
    fireEvent.press(nextBtn);
    expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-address');
  });

  it('renders CustomerOrderCancelDialog and handles cancel dismissal and confirm action', () => {
    render(<CustomerOrderCancelDialog orderId="demo-001" />);

    expect(screen.getByText('Hủy đơn #demo-001')).toBeOnTheScreen();
    expect(screen.getByTestId('order-cancel-dialog')).toBeOnTheScreen();

    const confirmCancelBtn = screen.getByTestId('cancel-dialog-confirm-btn');
    fireEvent.press(confirmCancelBtn);

    const dismissBtn = screen.getByTestId('cancel-dialog-dismiss-btn');
    fireEvent.press(dismissBtn);
    expect(mockBack).toHaveBeenCalled();
  });

  it('handles switching between activity filter tabs without filter errors', () => {
    render(<CustomerOrdersScreen />);

    const inProcessTab = screen.getByTestId('activity-filter-tab-in-process');
    fireEvent.press(inProcessTab);

    const finishedTab = screen.getByTestId('activity-filter-tab-finished');
    fireEvent.press(finishedTab);

    const cancelledTab = screen.getByTestId('activity-filter-tab-cancelled');
    fireEvent.press(cancelledTab);

    expect(screen.getByTestId('orders-customer-screen')).toBeOnTheScreen();
  });
});

describe('booking photo upload', () => {
  const localUri = 'file:///photo.jpg';
  const uploadedUrl = 'https://res.cloudinary.com/demo/image/upload/photo.jpg';
  let alert: jest.SpyInstance;

  beforeEach(() => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  async function choosePhoto() {
    fireEvent.press(screen.getByTestId('booking-add-photo-btn'));
    const buttons = alert.mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      buttons.find(button => button.text === 'Chọn từ thư viện ảnh').onPress();
    });
  }

  it('requires login before choosing a photo or continuing', () => {
    useAuthStore.setState({ isAuthenticated: false });
    const upload = jest.spyOn(OrdersApi, 'uploadImage');
    render(<CustomerBookingScreen />);
    fireEvent.press(screen.getByTestId('booking-add-photo-btn'));
    fireEvent.press(screen.getByTestId('booking-next-btn'));
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[0][0]).toBe('Yêu cầu đăng nhập');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    [{ statusCode: 401 }, 'Phiên làm việc hết hạn'],
    [{ kind: 'AUTH_ERROR' }, 'Phiên làm việc hết hạn'],
    [new Error('network'), 'Tải ảnh thất bại'],
  ])('removes local image after upload failure', async (error, title) => {
    useAuthStore.setState({ isAuthenticated: true });
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({ canceled: false, assets: [{ uri: localUri }] } as any);
    jest.spyOn(OrdersApi, 'uploadImage').mockRejectedValue(error);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<CustomerBookingScreen />);
    await choosePhoto();
    await waitFor(() => expect(alert).toHaveBeenCalledWith(title, expect.any(String), ...((title === 'Phiên làm việc hết hạn') ? [expect.any(Array)] : [])));
    expect(useBookingDraftStore.getState().mediaUrls).not.toContain(localUri);
  });

  it('blocks navigation during upload then replaces the local URI', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({ canceled: false, assets: [{ uri: localUri }] } as any);
    let finish!: (url: string) => void;
    jest.spyOn(OrdersApi, 'uploadImage').mockReturnValue(new Promise((resolve) => {
      finish = resolve;
    }));
    render(<CustomerBookingScreen />);
    await choosePhoto();
    await waitFor(() => expect(useBookingDraftStore.getState().mediaUrls).toContain(localUri));
    fireEvent.press(screen.getByTestId('booking-next-btn'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Đang tải ảnh', expect.any(String));
    await act(async () => finish(uploadedUrl));
    await waitFor(() => expect(useBookingDraftStore.getState().mediaUrls).toEqual([uploadedUrl]));
  });

  it('blocks navigation when a local URI remains', () => {
    useAuthStore.setState({ isAuthenticated: true });
    useBookingDraftStore.getState().addMediaUrl(localUri);
    render(<CustomerBookingScreen />);
    fireEvent.press(screen.getByTestId('booking-next-btn'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Ảnh chưa được lưu', expect.any(String));
  });
});
