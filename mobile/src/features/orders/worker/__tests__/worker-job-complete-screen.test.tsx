import type { UploadImageOptions } from '../../api/orders.api';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { OrdersApi } from '../../api/orders.api';
import { WorkerJobCompleteScreen } from '../screens/worker-job-complete-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'ORD-TEST-999' })),
}));

describe('WorkerJobCompleteScreen - Evidence Photo Attachment (TASK-11)', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => { });
    mockPush.mockClear();
    mockBack.mockClear();
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
    alertSpy.mockRestore();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  async function triggerPickFromLibrary(assets: { uri: string }[]) {
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

    fireEvent.press(screen.getByTestId('add-evidence-photo-btn'));
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as any[];
    const pickBtn = buttons?.find(b => b.text === 'Chọn từ thư viện ảnh');
    await act(async () => {
      pickBtn?.onPress();
    });
  }

  async function triggerCaptureFromCamera(asset: { uri: string }) {
    jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync').mockResolvedValue({
      status: 'granted' as any,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    jest.spyOn(ImagePicker, 'launchCameraAsync').mockResolvedValue({
      canceled: false,
      assets: [asset] as any,
    });

    fireEvent.press(screen.getByTestId('add-evidence-photo-btn'));
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as any[];
    const cameraBtn = buttons?.find(b => b.text === 'Chụp ảnh hiện trường');
    await act(async () => {
      cameraBtn?.onPress();
    });
  }

  it('Kịch bản 1: Chọn ảnh từ Thư viện và hiển thị tiến trình tải 2 giai đoạn', async () => {
    let capturedOptions: UploadImageOptions | undefined;
    let resolveUpload!: (url: string) => void;

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(
      async (_uri, _nameOrOptions, options) => {
        capturedOptions = typeof _nameOrOptions === 'object' ? _nameOrOptions : options;
        return new Promise<string>((resolve) => {
          resolveUpload = resolve;
        });
      },
    );

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([{ uri: 'file:///evidence-1.jpg' }]);

    // 1. Kiểm tra ban đầu có trạng thái đang tải
    expect(screen.getByText('Đang tải...')).toBeOnTheScreen();
    expect(screen.getByText('Ảnh minh chứng (1/5)')).toBeOnTheScreen();

    // 2. Cập nhật tiến độ upload 60%
    await act(async () => {
      capturedOptions?.onProgress?.(60);
    });
    expect(screen.getByText('60%')).toBeOnTheScreen();

    // 3. Hoàn tất upload lên Cloud Storage
    await act(async () => {
      resolveUpload('https://res.cloudinary.com/demo/image/upload/evidence-1.jpg');
    });

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeOnTheScreen();
    });
  });

  it('Kịch bản 2: Chụp ảnh từ Camera tại hiện trường', async () => {
    jest.spyOn(OrdersApi, 'uploadImage').mockResolvedValue(
      'https://res.cloudinary.com/demo/image/upload/camera-evidence.jpg',
    );

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerCaptureFromCamera({ uri: 'file:///camera-evidence.jpg' });

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeOnTheScreen();
      expect(screen.getByText('Ảnh minh chứng (1/5)')).toBeOnTheScreen();
    });
  });

  it('Kịch bản 3: Xóa ảnh đã chọn và cập nhật số lượng', async () => {
    jest.spyOn(OrdersApi, 'uploadImage').mockResolvedValue(
      'https://res.cloudinary.com/demo/image/upload/photo.jpg',
    );

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([{ uri: 'file:///photo-to-remove.jpg' }]);

    await waitFor(() => {
      expect(screen.getByText('Ảnh minh chứng (1/5)')).toBeOnTheScreen();
    });

    const removeBtn = screen.getByTestId('remove-evidence-btn-0');
    fireEvent.press(removeBtn);

    expect(screen.getByText('Ảnh minh chứng (0/5)')).toBeOnTheScreen();
    expect(screen.getByTestId('add-first-evidence-photo-btn')).toBeOnTheScreen();
  });

  it('Kịch bản 4: Xử lý lỗi khi upload ảnh thất bại và nút "Thử lại"', async () => {
    let shouldFail = true;
    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(async () => {
      if (shouldFail) {
        throw new Error('Lỗi mất kết nối mạng');
      }
      return 'https://res.cloudinary.com/demo/image/upload/retry-success.jpg';
    });

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([{ uri: 'file:///failing-photo.jpg' }]);

    await waitFor(() => {
      expect(screen.getByText('Lỗi tải')).toBeOnTheScreen();
      expect(screen.getByTestId('retry-upload-btn-0')).toBeOnTheScreen();
    });

    // Thử lại lần 2 thành công
    shouldFail = false;
    fireEvent.press(screen.getByTestId('retry-upload-btn-0'));

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeOnTheScreen();
      expect(screen.queryByText('Lỗi tải')).toBeNull();
    });
  });

  it('Kịch bản 5: Chặn nộp khi chưa có ảnh nào theo quy chuẩn ORD-10', async () => {
    const uploadEvidenceSpy = jest.spyOn(OrdersApi, 'uploadEvidence');
    const finishOrderSpy = jest.spyOn(OrdersApi, 'finishOrder');

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    fireEvent.press(finishBtn);

    expect(alertSpy).toHaveBeenCalledWith(
      'Yêu cầu bằng chứng (ORD-10)',
      expect.stringContaining('bắt buộc thợ phải đính kèm ít nhất 1 ảnh minh chứng'),
    );
    expect(uploadEvidenceSpy).not.toHaveBeenCalled();
    expect(finishOrderSpy).not.toHaveBeenCalled();
  });

  it('Kịch bản 6: Nộp thành công hoàn tất đơn hàng (uploadEvidence -> finishOrder -> Chuyển màn hình)', async () => {
    jest.spyOn(OrdersApi, 'uploadImage').mockResolvedValue(
      'https://res.cloudinary.com/demo/image/upload/clean-evidence.jpg',
    );
    const uploadEvidenceSpy = jest.spyOn(OrdersApi, 'uploadEvidence').mockResolvedValue({
      data: { id: 'evi-1', orderId: 'ORD-TEST-999', mediaUrl: 'https://res.cloudinary.com/demo/image/upload/clean-evidence.jpg', mediaType: 'image' } as any,
    } as any);
    const finishOrderSpy = jest.spyOn(OrdersApi, 'finishOrder').mockResolvedValue({
      data: { id: 'ORD-TEST-999', status: 'awaiting_customer_confirmation' } as any,
    } as any);

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([{ uri: 'file:///clean-evidence.jpg' }]);

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeOnTheScreen();
    });

    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(uploadEvidenceSpy).toHaveBeenCalledWith('ORD-TEST-999', {
        mediaUrl: 'https://res.cloudinary.com/demo/image/upload/clean-evidence.jpg',
        mediaType: 'image',
        description: expect.any(String),
      });
      expect(finishOrderSpy).toHaveBeenCalledWith('ORD-TEST-999');
      expect(alertSpy).toHaveBeenCalledWith(
        'Hoàn thành xuất sắc!',
        expect.stringContaining('Khách hàng đã nhận được thông báo để bấm nghiệm thu'),
        expect.any(Array),
      );
    });

    // Bấm nút "Về danh sách việc" trong alert
    const successButtons = alertSpy.mock.calls.find(c => c[0] === 'Hoàn thành xuất sắc!')?.[2];
    const navigateBtn = successButtons?.find((b: any) => b.text === 'Về danh sách việc');
    navigateBtn?.onPress();
    expect(mockPush).toHaveBeenCalledWith('/worker/jobs');
  });

  it('Kịch bản 7: Giới hạn tối đa 5 ảnh minh chứng', async () => {
    jest.spyOn(OrdersApi, 'uploadImage').mockResolvedValue(
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    );

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([
      { uri: 'file:///p1.jpg' },
      { uri: 'file:///p2.jpg' },
      { uri: 'file:///p3.jpg' },
      { uri: 'file:///p4.jpg' },
      { uri: 'file:///p5.jpg' },
    ]);

    await waitFor(() => {
      expect(screen.getByText('Ảnh minh chứng (5/5)')).toBeOnTheScreen();
    });

    // Thử bấm thêm ảnh lần nữa -> Báo giới hạn
    alertSpy.mockClear();
    const addBtn = screen.getByTestId('add-evidence-photo-btn');
    fireEvent.press(addBtn);

    expect(alertSpy).toHaveBeenCalledWith(
      'Giới hạn ảnh',
      expect.stringContaining('tối đa 5 hình ảnh minh chứng'),
    );
  });
});
