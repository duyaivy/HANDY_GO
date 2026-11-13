import type { UploadImageOptions } from '../../api/orders.api';
import type { TrackingEventItem } from '@/features/tracking';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { useTrackingEvents } from '@/features/tracking';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { OrdersApi } from '../../api/orders.api';
import { WorkerJobCompleteScreen } from '../screens/worker-job-complete-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
let capturedTrackingEvent: ((event: TrackingEventItem) => void) | undefined;

jest.mock('@/features/tracking', () => ({
  useTrackingEvents: jest.fn(),
}));

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
    capturedTrackingEvent = undefined;
    (useTrackingEvents as jest.Mock).mockImplementation((_serviceRequestId, onEvent) => {
      capturedTrackingEvent = onEvent;
      return { connectionStatus: 'connected' };
    });
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
    let orderStatus = 'in_progress';
    jest.spyOn(OrdersApi, 'getOrderDetail').mockImplementation(async () => ({
      data: { id: 'ORD-TEST-999', status: orderStatus, evidences: [] },
      statusCode: 200,
      message: 'OK',
    } as any));
    jest.spyOn(OrdersApi, 'uploadImage').mockResolvedValue(
      'https://res.cloudinary.com/demo/image/upload/clean-evidence.jpg',
    );
    const uploadEvidenceSpy = jest.spyOn(OrdersApi, 'uploadEvidence').mockResolvedValue({
      data: { id: 'evi-1', orderId: 'ORD-TEST-999', mediaUrl: 'https://res.cloudinary.com/demo/image/upload/clean-evidence.jpg', mediaType: 'image' } as any,
    } as any);
    const finishOrderSpy = jest.spyOn(OrdersApi, 'finishOrder').mockImplementation(async () => {
      orderStatus = 'awaiting_customer_confirmation';
      return { data: { id: 'ORD-TEST-999', status: orderStatus, evidences: [] } } as any;
    });

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([{ uri: 'file:///clean-evidence.jpg' }]);

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeOnTheScreen();
    });

    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(uploadEvidenceSpy).toHaveBeenCalledWith('ORD-TEST-999', {
        clientEvidenceId: expect.any(String),
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

    await waitFor(() => {
      expect(screen.getByText('Đã nộp bằng chứng, đang chờ khách nghiệm thu')).toBeOnTheScreen();
      expect(screen.getByText('Đã nộp, chờ khách nghiệm thu')).toBeOnTheScreen();
      expect(screen.queryByText('⚠️ Trạng thái đơn không hợp lệ:')).toBeNull();
      expect(screen.getByTestId('worker-finish-order-btn').props.accessibilityState?.disabled).toBe(true);
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

  it('P2-05: disables submit button and prevents completion when order status is confirmed', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: {
        id: 'ORD-TEST-999',
        status: 'confirmed',
      },
      statusCode: 200,
      message: 'OK',
    } as any);

    const finishSpy = jest.spyOn(OrdersApi, 'finishOrder');
    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await waitFor(() => {
      expect(screen.getByText('⚠️ Trạng thái đơn không hợp lệ:')).toBeOnTheScreen();
    });

    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    expect(finishBtn.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(finishBtn);
    expect(finishSpy).not.toHaveBeenCalled();
  });

  it('P2-05: disables submit button and prevents completion when order status is cancelled', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: {
        id: 'ORD-TEST-999',
        status: 'cancelled',
      },
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await waitFor(() => {
      expect(screen.getByText('⚠️ Trạng thái đơn không hợp lệ:')).toBeOnTheScreen();
    });

    const finishBtnCancelled = screen.getByTestId('worker-finish-order-btn');
    expect(finishBtnCancelled.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Không thể nộp (Trạng thái: cancelled)')).toBeOnTheScreen();
  });

  it('P2-05: disables submit button and prevents completion when order status is completed', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: {
        id: 'ORD-TEST-999',
        status: 'completed',
      },
      statusCode: 200,
      message: 'OK',
    } as any);

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await waitFor(() => {
      expect(screen.getByText('⚠️ Trạng thái đơn không hợp lệ:')).toBeOnTheScreen();
    });

    const finishBtnCompleted = screen.getByTestId('worker-finish-order-btn');
    expect(finishBtnCompleted.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Không thể nộp (Trạng thái: completed)')).toBeOnTheScreen();
  });

  it('unlocks evidence submission when a customer rework event updates the Order status', async () => {
    const initialOrder = {
      id: 'ORD-TEST-999',
      serviceRequestId: 'REQ-TEST-999',
      status: 'awaiting_customer_confirmation',
      evidences: [],
    };
    let currentOrder = initialOrder;
    jest.spyOn(OrdersApi, 'getOrderDetail').mockImplementation(async () => ({
      statusCode: 200,
      message: 'OK',
      data: currentOrder,
    } as any));

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);
    await waitFor(() => {
      expect(screen.getByText('Đã nộp, chờ khách nghiệm thu')).toBeOnTheScreen();
      expect(capturedTrackingEvent).toBeDefined();
    });

    currentOrder = { ...initialOrder, status: 'in_progress' };
    act(() => {
      capturedTrackingEvent?.({
        entityId: 'ORD-TEST-999',
        eventType: 'order.rework_requested',
        toStatus: 'in_progress',
      } as TrackingEventItem);
    });

    await waitFor(() => {
      expect(screen.getByText('Nộp Bằng Chứng & Báo Hoàn Thành (ORD-10)')).toBeOnTheScreen();
      expect(screen.queryByTestId('worker-refresh-order-status-btn')).toBeNull();
    });
  });

  it('lets the worker refresh an old awaiting-confirmation status after missing SSE', async () => {
    const initialOrder = { id: 'ORD-TEST-999', status: 'awaiting_customer_confirmation', evidences: [] };
    let currentOrder = initialOrder;
    jest.spyOn(OrdersApi, 'getOrderDetail').mockImplementation(async () => ({
      statusCode: 200,
      message: 'OK',
      data: currentOrder,
    } as any));

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);
    const refreshButton = await screen.findByTestId('worker-refresh-order-status-btn');
    currentOrder = { ...initialOrder, status: 'in_progress' };
    fireEvent.press(refreshButton);

    await waitFor(() => {
      expect(screen.getByText('Nộp Bằng Chứng & Báo Hoàn Thành (ORD-10)')).toBeOnTheScreen();
    });
  });

  it('ORD-10: Lỗi ở ảnh thứ ba rồi gửi lại: chỉ ảnh thứ ba được gửi lại, ảnh 1 và 2 không bị gửi trùng', async () => {
    let uploadEvidenceCallCount = 0;
    const uploadedPayloads: any[] = [];

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(async (uri) => {
      return `https://res.cloudinary.com/demo/image/upload/${uri.replace('file:///', '')}`;
    });

    jest.spyOn(OrdersApi, 'uploadEvidence').mockImplementation(async (_jobId, payload) => {
      uploadEvidenceCallCount++;
      uploadedPayloads.push(payload);
      if (uploadEvidenceCallCount === 3) {
        // Thất bại ở ảnh thứ ba lần đầu
        throw new Error('Lỗi mạng khi tải ảnh 3');
      }
      return {
        data: {
          id: `evi-${uploadEvidenceCallCount}`,
          orderId: 'ORD-TEST-999',
          clientEvidenceId: payload.clientEvidenceId,
          mediaUrl: payload.mediaUrl,
          mediaType: payload.mediaType,
        },
      } as any;
    });

    const finishOrderSpy = jest.spyOn(OrdersApi, 'finishOrder').mockResolvedValue({
      data: { id: 'ORD-TEST-999', status: 'awaiting_customer_confirmation' } as any,
    } as any);

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([
      { uri: 'file:///photo-1.jpg' },
      { uri: 'file:///photo-2.jpg' },
      { uri: 'file:///photo-3.jpg' },
    ]);

    await waitFor(() => {
      expect(screen.getByText('Ảnh minh chứng (3/5)')).toBeOnTheScreen();
    });

    // Lần 1: Bấm nộp hoàn thành -> Sẽ fail ở ảnh 3
    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Không thể hoàn tất đơn việc',
        expect.stringContaining('Lỗi mạng khi tải ảnh 3'),
      );
    });

    // Ảnh 1, 2 thành công, ảnh 3 fail -> Tổng cộng 3 lần gọi
    expect(uploadEvidenceCallCount).toBe(3);
    expect(finishOrderSpy).not.toHaveBeenCalled();

    // Lần 2: Người dùng bấm Nộp lại -> Chỉ có ảnh 3 được nộp, ảnh 1 và 2 KHÔNG được nộp lại!
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(finishOrderSpy).toHaveBeenCalledWith('ORD-TEST-999');
    });

    // Tổng số lần gọi uploadEvidence là 4 (lần 1: ảnh 1, 2, 3; lần 2: chỉ ảnh 3)
    expect(uploadEvidenceCallCount).toBe(4);
    // Kiểm tra ảnh 1 và ảnh 2 chỉ xuất hiện đúng 1 lần trong uploadedPayloads
    const photo1Uploads = uploadedPayloads.filter(p => p.mediaUrl.includes('photo-1.jpg'));
    const photo2Uploads = uploadedPayloads.filter(p => p.mediaUrl.includes('photo-2.jpg'));
    const photo3Uploads = uploadedPayloads.filter(p => p.mediaUrl.includes('photo-3.jpg'));
    expect(photo1Uploads).toHaveLength(1);
    expect(photo2Uploads).toHaveLength(1);
    expect(photo3Uploads).toHaveLength(2);
  });

  it('ORD-10: finishOrder() lỗi rồi gửi lại: không tạo thêm evidence; gọi trực tiếp finishOrder()', async () => {
    let uploadEvidenceCalls = 0;
    let finishOrderCalls = 0;

    jest.spyOn(OrdersApi, 'uploadImage').mockResolvedValue(
      'https://res.cloudinary.com/demo/image/upload/clean.jpg',
    );
    jest.spyOn(OrdersApi, 'uploadEvidence').mockImplementation(async () => {
      uploadEvidenceCalls++;
      return {
        data: { id: 'evi-x', orderId: 'ORD-TEST-999' },
      } as any;
    });

    jest.spyOn(OrdersApi, 'finishOrder').mockImplementation(async () => {
      finishOrderCalls++;
      if (finishOrderCalls === 1) {
        throw new Error('Lỗi máy chủ khi chuyển trạng thái đơn (500)');
      }
      return {
        data: { id: 'ORD-TEST-999', status: 'awaiting_customer_confirmation' },
      } as any;
    });

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([{ uri: 'file:///clean.jpg' }]);

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeOnTheScreen();
    });

    const finishBtn = screen.getByTestId('worker-finish-order-btn');

    // Lần 1: uploadEvidence thành công, finishOrder lỗi
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Không thể hoàn tất đơn việc',
        expect.stringContaining('Lỗi máy chủ khi chuyển trạng thái đơn'),
      );
    });

    expect(uploadEvidenceCalls).toBe(1);
    expect(finishOrderCalls).toBe(1);

    // Lần 2: Bấm lại -> KHÔNG uploadEvidence lại, gọi thẳng finishOrder
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Hoàn thành xuất sắc!',
        expect.stringContaining('Khách hàng đã nhận được thông báo'),
        expect.any(Array),
      );
    });

    // uploadEvidence vẫn là 1 (không tạo thêm evidence), finishOrder được gọi lần 2 và thành công
    expect(uploadEvidenceCalls).toBe(1);
    expect(finishOrderCalls).toBe(2);
  });

  it('ORD-10: Ảnh mới được thêm sau lần gửi lỗi vẫn được lưu bình thường', async () => {
    const uploadedMediaUrls: string[] = [];

    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(async (uri) => {
      return `https://res.cloudinary.com/demo/image/upload/${uri.replace('file:///', '')}`;
    });

    jest.spyOn(OrdersApi, 'uploadEvidence').mockImplementation(async (_jobId, payload) => {
      uploadedMediaUrls.push(payload.mediaUrl);
      return {
        data: { id: `evi-${uploadedMediaUrls.length}`, orderId: 'ORD-TEST-999' },
      } as any;
    });

    let finishOrderAttempts = 0;
    jest.spyOn(OrdersApi, 'finishOrder').mockImplementation(async () => {
      finishOrderAttempts++;
      if (finishOrderAttempts === 1) {
        throw new Error('Network timeout');
      }
      return {
        data: { id: 'ORD-TEST-999', status: 'awaiting_customer_confirmation' },
      } as any;
    });

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await triggerPickFromLibrary([{ uri: 'file:///first-photo.jpg' }]);

    await waitFor(() => {
      expect(screen.getByText('✓')).toBeOnTheScreen();
    });

    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Không thể hoàn tất đơn việc', expect.any(String));
    });

    expect(uploadedMediaUrls).toEqual([
      'https://res.cloudinary.com/demo/image/upload/first-photo.jpg',
    ]);

    // Thêm ảnh thứ 2
    await triggerPickFromLibrary([{ uri: 'file:///second-photo.jpg' }]);

    await waitFor(() => {
      expect(screen.getByText('Ảnh minh chứng (2/5)')).toBeOnTheScreen();
    });

    // Bấm hoàn thành lần nữa -> Chỉ ảnh 2 được nộp, ảnh 1 không bị lặp lại
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Hoàn thành xuất sắc!', expect.any(String), expect.any(Array));
    });

    expect(uploadedMediaUrls).toEqual([
      'https://res.cloudinary.com/demo/image/upload/first-photo.jpg',
      'https://res.cloudinary.com/demo/image/upload/second-photo.jpg',
    ]);
  });

  it('ORD-10: Đồng bộ ảnh đã được Order Service lưu từ trước và không upload lại khi finish', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: {
        id: 'ORD-TEST-999',
        status: 'in_progress',
        evidences: [
          {
            id: 'backend-evi-1',
            orderId: 'ORD-TEST-999',
            clientEvidenceId: 'client-key-1',
            mediaUrl: 'https://res.cloudinary.com/demo/image/upload/synced-1.jpg',
            mediaType: 'image',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      statusCode: 200,
      message: 'OK',
    } as any);

    const uploadEvidenceSpy = jest.spyOn(OrdersApi, 'uploadEvidence');
    const finishOrderSpy = jest.spyOn(OrdersApi, 'finishOrder').mockResolvedValue({
      data: { id: 'ORD-TEST-999', status: 'awaiting_customer_confirmation' } as any,
    } as any);

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    // Kiểm tra ảnh từ backend được tải lên và hiển thị là completed (1/5)
    await waitFor(() => {
      expect(screen.getByText('Ảnh minh chứng (1/5)')).toBeOnTheScreen();
      expect(screen.getByText('✓')).toBeOnTheScreen();
    });

    // Bấm nộp hoàn thành -> Không uploadEvidence mà gọi thẳng finishOrder
    const finishBtn = screen.getByTestId('worker-finish-order-btn');
    fireEvent.press(finishBtn);

    await waitFor(() => {
      expect(uploadEvidenceSpy).not.toHaveBeenCalled();
      expect(finishOrderSpy).toHaveBeenCalledWith('ORD-TEST-999');
    });
  });

  it('ORD-10: Xóa ảnh đã persisted sẽ gọi OrdersApi.deleteEvidence', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: {
        id: 'ORD-TEST-999',
        status: 'in_progress',
        evidences: [
          {
            id: 'backend-evi-del-1',
            orderId: 'ORD-TEST-999',
            clientEvidenceId: 'client-key-del',
            mediaUrl: 'https://res.cloudinary.com/demo/image/upload/synced-del.jpg',
            mediaType: 'image',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      statusCode: 200,
      message: 'OK',
    } as any);

    const deleteEvidenceSpy = jest.spyOn(OrdersApi, 'deleteEvidence').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: null,
    } as any);

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);

    await waitFor(() => {
      expect(screen.getByText('Ảnh minh chứng (1/5)')).toBeOnTheScreen();
    });

    // Bấm nút xóa ảnh
    const removeBtn = screen.getByTestId('remove-evidence-btn-0');
    fireEvent.press(removeBtn);

    await waitFor(() => {
      expect(screen.getByText('Ảnh minh chứng (0/5)')).toBeOnTheScreen();
      expect(deleteEvidenceSpy).toHaveBeenCalledWith('ORD-TEST-999', 'backend-evi-del-1');
    });
  });

  it('ORD-10: Không hoàn tất đơn khi 1 ảnh tải thành công và 2 ảnh tải lỗi', async () => {
    jest.spyOn(OrdersApi, 'uploadImage').mockImplementation(async (uri) => {
      if (uri.includes('good')) {
        return 'https://example.com/good.jpg';
      }
      throw new Error('CDN unavailable');
    });
    const uploadEvidenceSpy = jest.spyOn(OrdersApi, 'uploadEvidence');
    const finishOrderSpy = jest.spyOn(OrdersApi, 'finishOrder');

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);
    await triggerPickFromLibrary([
      { uri: 'file:///good.jpg' },
      { uri: 'file:///failed-1.jpg' },
      { uri: 'file:///failed-2.jpg' },
    ]);
    await waitFor(() => expect(screen.getAllByText('Lỗi tải')).toHaveLength(2));

    fireEvent.press(screen.getByTestId('worker-finish-order-btn'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Có ảnh chưa tải lên',
      expect.stringContaining('Thử lại hoặc xóa ảnh lỗi'),
    );
    expect(uploadEvidenceSpy).not.toHaveBeenCalled();
    expect(finishOrderSpy).not.toHaveBeenCalled();
  });

  it('ORD-10: Giữ ảnh và báo lỗi khi xóa evidence trên server thất bại', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      data: {
        id: 'ORD-TEST-999',
        status: 'in_progress',
        evidences: [{
          id: 'backend-evi-failed-delete',
          orderId: 'ORD-TEST-999',
          clientEvidenceId: 'client-key-failed-delete',
          mediaUrl: 'https://example.com/evidence.jpg',
          mediaType: 'image',
          createdAt: new Date().toISOString(),
        }],
      },
      statusCode: 200,
      message: 'OK',
    } as any);
    const deleteEvidenceSpy = jest.spyOn(OrdersApi, 'deleteEvidence').mockRejectedValue(new Error('Network error'));

    render(<WorkerJobCompleteScreen jobId="ORD-TEST-999" />);
    expect(await screen.findByText('Ảnh minh chứng (1/5)')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('remove-evidence-btn-0'));

    await waitFor(() => {
      expect(deleteEvidenceSpy).toHaveBeenCalledWith('ORD-TEST-999', 'backend-evi-failed-delete');
      expect(alertSpy).toHaveBeenCalledWith('Không thể xóa ảnh', expect.stringContaining('Ảnh vẫn còn trên máy chủ'));
    });
    expect(screen.getByText('Ảnh minh chứng (1/5)')).toBeOnTheScreen();
    expect(screen.getByTestId('evidence-item-0')).toBeOnTheScreen();
  });
});
