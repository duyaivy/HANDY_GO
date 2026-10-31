/* eslint-disable max-lines-per-function */
import type { UploadImageOptions } from '../../api/orders.api';
import * as ImagePicker from 'expo-image-picker';
import * as React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { OrdersApi } from '../../api/orders.api';
import { useBookingDraftStore } from '../../stores/use-booking-draft-store';
import { CustomerBookingScreen } from '../screens/customer-booking-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ serviceId: 'srv-water-leak' })),
}));

const initialAuthState = useAuthStore.getState();

describe('customerBookingScreen - Image Upload Progress (TASK-01)', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useAuthStore.setState({ isAuthenticated: true });
    useBookingDraftStore.getState().resetDraft();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState(initialAuthState, true);
    useBookingDraftStore.getState().resetDraft();
    delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  async function triggerPickPhoto(assets: { uri: string }[]) {
    jest.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
      status: 'granted' as any,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
      canceled: false,
      assets: assets as any,
    });

    fireEvent.press(screen.getByTestId('booking-add-photo-btn'));
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as any[];
    const pickBtn = buttons?.find(b => b.text === 'Chọn từ thư viện ảnh');
    await act(async () => {
      pickBtn?.onPress();
    });
  }

  it('ca 1: Upload 1 ảnh hiển thị tiến độ % -> Đang xử lý -> hoàn tất checkmark', async () => {
    let capturedOptions: UploadImageOptions | undefined;
    let resolveUpload!: (url: string) => void;

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (_uri, _nameOrOptions, options) => {
        capturedOptions = options;
        return new Promise<string>((resolve) => {
          resolveUpload = resolve;
        });
      },
    );

    render(<CustomerBookingScreen />);
    await triggerPickPhoto([{ uri: 'file:///photo-1.jpg' }]);

    // 1. Kiểm tra trạng thái đang tải ban đầu
    expect(screen.getAllByText('Đang tải...').length).toBeGreaterThanOrEqual(1);

    // 2. Tiến độ đạt 45% -> hiển thị 45%
    await act(async () => {
      capturedOptions?.onProgress?.(45);
    });
    expect(screen.getByText('45%')).toBeOnTheScreen();

    // 3. Tiến độ đạt 100% -> hiển thị "Đang xử lý" trước khi server phản hồi
    await act(async () => {
      capturedOptions?.onProgress?.(100);
    });
    expect(screen.getByText('Đang xử lý')).toBeOnTheScreen();
    expect(screen.queryByText('45%')).toBeNull();

    // 4. Server phản hồi 200 OK với URL
    await act(async () => {
      resolveUpload('https://res.cloudinary.com/demo/image/upload/photo-1.jpg');
    });

    await waitFor(() => {
      expect(screen.queryByText('Đang xử lý')).toBeNull();
      expect(useBookingDraftStore.getState().mediaUrls).toEqual([
        'https://res.cloudinary.com/demo/image/upload/photo-1.jpg',
      ]);
    });
  }, 15000);

  it('ca 2: Tải nhiều ảnh tuần tự (ảnh 1 tải, ảnh 2 và 3 ở trạng thái chờ tải)', async () => {
    const resolvers: Array<(url: string) => void> = [];

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (_uri) => {
        return new Promise<string>((resolve) => {
          resolvers.push(resolve);
        });
      },
    );

    render(<CustomerBookingScreen />);
    await triggerPickPhoto([
      { uri: 'file:///photo-1.jpg' },
      { uri: 'file:///photo-2.jpg' },
      { uri: 'file:///photo-3.jpg' },
    ]);

    // Ảnh 1 đang tải, ảnh 2 và ảnh 3 ở trạng thái "Chờ tải"
    expect(screen.getAllByText('Chờ tải').length).toBe(2);
    expect(screen.getAllByText('Đang tải...').length).toBeGreaterThanOrEqual(1);
    expect(resolvers.length).toBe(1);

    // Hoàn tất ảnh 1 -> chuyển sang ảnh 2
    await act(async () => {
      resolvers[0]('https://res.cloudinary.com/demo/photo-1.jpg');
    });

    await waitFor(() => {
      // Chỉ còn 1 ảnh chờ tải (ảnh 3), ảnh 2 bắt đầu tải
      expect(screen.getAllByText('Chờ tải').length).toBe(1);
      expect(resolvers.length).toBe(2);
    });

    // Hoàn tất ảnh 2 -> chuyển sang ảnh 3
    await act(async () => {
      resolvers[1]('https://res.cloudinary.com/demo/photo-2.jpg');
    });

    await waitFor(() => {
      expect(screen.queryByText('Chờ tải')).toBeNull();
      expect(resolvers.length).toBe(3);
    });

    // Hoàn tất ảnh 3 -> toàn bộ hoàn tất
    await act(async () => {
      resolvers[2]('https://res.cloudinary.com/demo/photo-3.jpg');
    });

    await waitFor(() => {
      expect(useBookingDraftStore.getState().mediaUrls).toEqual([
        'https://res.cloudinary.com/demo/photo-1.jpg',
        'https://res.cloudinary.com/demo/photo-2.jpg',
        'https://res.cloudinary.com/demo/photo-3.jpg',
      ]);
    });
  });

  it('ca 3: Cảnh báo giới hạn tối đa 5 ảnh khi người dùng chọn quá số lượng', async () => {
    render(<CustomerBookingScreen />);

    // Thử chọn 6 ảnh cùng lúc
    await triggerPickPhoto([
      { uri: 'file:///p1.jpg' },
      { uri: 'file:///p2.jpg' },
      { uri: 'file:///p3.jpg' },
      { uri: 'file:///p4.jpg' },
      { uri: 'file:///p5.jpg' },
      { uri: 'file:///p6.jpg' },
    ]);

    expect(alertSpy).toHaveBeenCalledWith(
      'Giới hạn ảnh',
      'Bạn chỉ có thể đính kèm tối đa 5 hình ảnh hiện trường.',
    );
    expect(useBookingDraftStore.getState().mediaUrls.length).toBe(0);
  });

  it('ca 4: Xử lý mạng chậm/tiến độ vô định không crash hoặc hiển thị NaN%', async () => {
    let capturedOptions: UploadImageOptions | undefined;
    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (_uri, _name, options) => {
        capturedOptions = options;
        return new Promise(() => {});
      },
    );

    render(<CustomerBookingScreen />);
    await triggerPickPhoto([{ uri: 'file:///p1.jpg' }]);

    // Không có event.total, progress = 0 (spinner vô định)
    expect(screen.getAllByText('Đang tải...').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/NaN/)).toBeNull();

    // Giả lập progress event không có total hợp lệ
    await act(async () => {
      capturedOptions?.onProgress?.(0);
    });
    expect(screen.getAllByText('Đang tải...').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('ca 5: Đạt 100% byte hiển thị "Đang xử lý", không hiện checkmark giả trước khi server trả 200', async () => {
    let capturedOptions: UploadImageOptions | undefined;
    let resolveUpload!: (url: string) => void;

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (_uri, _name, options) => {
        capturedOptions = options;
        return new Promise<string>((resolve) => {
          resolveUpload = resolve;
        });
      },
    );

    render(<CustomerBookingScreen />);
    await triggerPickPhoto([{ uri: 'file:///p1.jpg' }]);

    // Phát sự kiện 100% byte đã gửi lên socket
    await act(async () => {
      capturedOptions?.onProgress?.(100);
    });

    expect(screen.getByText('Đang xử lý')).toBeOnTheScreen();
    // Chưa có checkmark badge
    expect(screen.queryByTestId(/^completed-badge-/)).toBeNull();

    // Sau khi server trả response thành công
    await act(async () => {
      resolveUpload('https://res.cloudinary.com/demo/p1.jpg');
    });

    await waitFor(() => {
      expect(screen.getByTestId(/^completed-badge-/)).toBeOnTheScreen();
    });
  });

  it('ca 6: Lỗi mạng khi tải ảnh 2 -> báo lỗi tiếng Việt, chặn Tiếp tục, giữ ảnh 1', async () => {
    let rejectPhoto2!: (err: any) => void;
    let resolvePhoto1!: (url: string) => void;

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (uri) => {
        if (uri.includes('photo-1')) {
          return new Promise<string>((resolve) => {
            resolvePhoto1 = resolve;
          });
        }
        return new Promise<string>((_resolve, reject) => {
          rejectPhoto2 = reject;
        });
      },
    );

    render(<CustomerBookingScreen />);
    await triggerPickPhoto([
      { uri: 'file:///photo-1.jpg' },
      { uri: 'file:///photo-2.jpg' },
    ]);

    // Ảnh 1 hoàn tất
    await act(async () => {
      resolvePhoto1('https://res.cloudinary.com/demo/photo-1.jpg');
    });

    // Ảnh 2 bị lỗi mạng
    await act(async () => {
      rejectPhoto2(new Error('Network error'));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Tải ảnh thất bại',
        'Không thể tải ảnh lên máy chủ. Vui lòng thử lại sau hoặc kiểm tra kết nối mạng.',
      );
      expect(screen.getByText('Lỗi tải')).toBeOnTheScreen();
      expect(screen.getByText('Thử lại')).toBeOnTheScreen();
    });

    // Nhấn "Tiếp tục" bị chặn và hiển thị thông báo ảnh chưa lưu
    fireEvent.press(screen.getByTestId('booking-next-btn'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Ảnh chưa được lưu',
      'Có ảnh chưa tải lên máy chủ thành công. Vui lòng xóa hoặc tải lại ảnh trước khi tiếp tục.',
    );

    // Ảnh 1 vẫn còn trong danh sách thành công
    expect(useBookingDraftStore.getState().mediaUrls).toEqual([
      'https://res.cloudinary.com/demo/photo-1.jpg',
    ]);
  });

  it('ca 7: Nhấn nút xóa trên ảnh đang tải -> HTTP abort ngay, thumbnail biến mất', async () => {
    let capturedSignal: AbortSignal | undefined;

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (_uri, _name, options) => {
        capturedSignal = options?.signal;
        return new Promise(() => {});
      },
    );

    render(<CustomerBookingScreen />);
    await triggerPickPhoto([{ uri: 'file:///photo-cancelling.jpg' }]);

    expect(screen.getAllByText('Đang tải...').length).toBeGreaterThanOrEqual(1);
    expect(capturedSignal?.aborted).toBe(false);

    // Bấm nút xóa thumbnail
    const removeBtn = screen.getByTestId(/^remove-photo-btn-/);
    fireEvent.press(removeBtn);

    // Signal bị abort ngay lập tức
    expect(capturedSignal?.aborted).toBe(true);

    // Thumbnail biến mất khỏi giao diện
    expect(screen.queryByTestId(/^booking-photo-thumbnail-/)).toBeNull();
    expect(useBookingDraftStore.getState().mediaUrls).toEqual([]);
  });

  it('ca 8: Rời màn hình (unmount) khi đang tải -> abort tác vụ, không gây crash hoặc leak', async () => {
    let capturedSignal: AbortSignal | undefined;

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (_uri, _name, options) => {
        capturedSignal = options?.signal;
        return new Promise(() => {});
      },
    );

    const { unmount } = render(<CustomerBookingScreen />);
    await triggerPickPhoto([{ uri: 'file:///photo-in-flight.jpg' }]);

    expect(capturedSignal?.aborted).toBe(false);

    // Unmount component (mô phỏng Back)
    unmount();

    expect(capturedSignal?.aborted).toBe(true);
    expect(useBookingDraftStore.getState().mediaUrls).toEqual([]);
  });
});
