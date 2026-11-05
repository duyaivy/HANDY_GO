import type { HandyCoordinates } from '@/components/map/handy-map';
import { Keyboard } from 'react-native';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { DeviceLocationService } from '@/services/location/device-location';
import { MapboxService } from '@/services/map/mapbox-service';
import CustomerBookingSelectAddressRoute from '../select-address';

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
  useLocalSearchParams: jest.fn(() => ({})),
}));

let capturedOnRegionDidChange: ((coords: HandyCoordinates) => void) | null = null;
const mockFlyTo = jest.fn();

jest.mock('@/components/map/handy-map', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    HandyMap: ({ onRegionDidChange, ref }: any) => {
      React.useEffect(() => {
        capturedOnRegionDidChange = onRegionDidChange;
      }, [onRegionDidChange]);
      React.useImperativeHandle(ref, () => ({
        flyTo: mockFlyTo,
        zoomIn: jest.fn(),
        zoomOut: jest.fn(),
      }));
      return <View testID="mock-handy-map" />;
    },
  };
});

describe('customerBookingSelectAddressRoute - Input & Focus Isolation (TASK-10)', () => {
  let keyboardDismissSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    keyboardDismissSpy = jest.spyOn(Keyboard, 'dismiss');
    useBookingDraftStore.getState().resetDraft();
    capturedOnRegionDidChange = null;
    mockFlyTo.mockClear();
    mockPush.mockClear();
    mockBack.mockClear();
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    keyboardDismissSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('Kịch bản 1: Nhập địa chỉ thủ công không bao giờ tự động sập bàn phím (Keyboard.dismiss)', () => {
    render(<CustomerBookingSelectAddressRoute />);

    const input = screen.getByTestId('booking-address-input');

    // Giả lập focus vào ô nhập
    fireEvent(input, 'focus');
    expect(keyboardDismissSpy).not.toHaveBeenCalled();

    // Gõ liên tục văn bản địa chỉ
    fireEvent.changeText(input, '123 Nguyễn Lương Bằng, Hòa Khánh Bắc');
    expect(input.props.value).toBe('123 Nguyễn Lương Bằng, Hòa Khánh Bắc');
    expect(keyboardDismissSpy).not.toHaveBeenCalled();
  });

  it('Kịch bản 2: Khi gõ địa chỉ và forward geocoding hoàn tất, camera flyTo nhưng KHÔNG kích hoạt reverse geocoding đè text', async () => {
    const forwardSpy = jest.spyOn(MapboxService, 'forwardGeocode').mockResolvedValue({
      latitude: 16.075,
      longitude: 108.152,
      placeName: '123 Đường Nguyễn Lương Bằng, Đà Nẵng',
    });
    const reverseSpy = jest.spyOn(MapboxService, 'reverseGeocode').mockResolvedValue('Đà Nẵng');

    render(<CustomerBookingSelectAddressRoute />);
    const input = screen.getByTestId('booking-address-input');

    fireEvent(input, 'focus');
    fireEvent.changeText(input, '123 Nguyễn Lương Bằng');

    // Chờ debounce forward geocode 700ms
    act(() => {
      jest.advanceTimersByTime(700);
    });

    await waitFor(() => {
      expect(forwardSpy).toHaveBeenCalledWith('123 Nguyễn Lương Bằng', expect.any(Object));
      expect(mockFlyTo).toHaveBeenCalledWith({ latitude: 16.075, longitude: 108.152 }, 16);
    });

    // Giả lập bản đồ di chuyển và bắn sự kiện onRegionDidChange
    expect(capturedOnRegionDidChange).not.toBeNull();
    act(() => {
      capturedOnRegionDidChange!({ latitude: 16.075, longitude: 108.152 });
      jest.advanceTimersByTime(600);
    });

    // Kiểm tra: Bàn phím KHÔNG bị đóng, reverseGeocode KHÔNG được gọi đè lên input
    expect(keyboardDismissSpy).not.toHaveBeenCalled();
    expect(reverseSpy).not.toHaveBeenCalled();
    expect(input.props.value).toBe('123 Nguyễn Lương Bằng');
  });

  it('Kịch bản 3: Kéo thả bản đồ bằng tay (không focus input) cập nhật reverse geocode và đóng bàn phím', async () => {
    const reverseSpy = jest.spyOn(MapboxService, 'reverseGeocode').mockResolvedValue('456 Tôn Đức Thắng, Liên Chiểu');

    render(<CustomerBookingSelectAddressRoute />);
    const input = screen.getByTestId('booking-address-input');

    // Không focus ô input, người dùng dùng tay vuốt bản đồ
    expect(capturedOnRegionDidChange).not.toBeNull();
    act(() => {
      capturedOnRegionDidChange!({ latitude: 16.06, longitude: 108.16 });
    });

    // 1. Phải gọi Keyboard.dismiss() khi người dùng thao tác kéo bản đồ
    expect(keyboardDismissSpy).toHaveBeenCalled();

    // 2. Chờ debounce 500ms cho reverse geocoding
    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(reverseSpy).toHaveBeenCalledWith(16.06, 108.16);
      expect(input.props.value).toBe('456 Tôn Đức Thắng, Liên Chiểu');
      expect(useBookingDraftStore.getState().addressText).toBe('456 Tôn Đức Thắng, Liên Chiểu');
    });
  });

  it('Kịch bản 4: Cold-start GPS ngầm không đè bẹp nội dung người dùng đang gõ', async () => {
    let resolveGps: (val: any) => void;
    const gpsPromise = new Promise((resolve) => {
      resolveGps = resolve;
    });

    jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockReturnValue(gpsPromise as any);

    render(<CustomerBookingSelectAddressRoute />);
    const input = screen.getByTestId('booking-address-input');

    // Người dùng ngay lập tức chạm vào input và gõ
    fireEvent(input, 'focus');
    fireEvent.changeText(input, 'Ngõ 55 Điện Biên Phủ');

    // Sau đó GPS cold start mới hoàn thành
    await act(async () => {
      resolveGps!({
        status: 'gps_success',
        isRealGps: true,
        coordinates: {
          latitude: 16.08,
          longitude: 108.15,
          addressText: 'Vị trí GPS tự động',
        },
      });
    });

    // Văn bản trong ô input không bị ghi đè bởi vị trí GPS
    expect(input.props.value).toBe('Ngõ 55 Điện Biên Phủ');
    expect(keyboardDismissSpy).not.toHaveBeenCalled();
  });

  it('Kịch bản 5: Bấm nút clear "✕" xóa trắng nội dung và hủy timer forward geocode', () => {
    const forwardSpy = jest.spyOn(MapboxService, 'forwardGeocode');

    render(<CustomerBookingSelectAddressRoute />);
    const input = screen.getByTestId('booking-address-input');

    fireEvent.changeText(input, 'Địa chỉ tạm');
    expect(input.props.value).toBe('Địa chỉ tạm');

    const clearBtn = screen.getByTestId('address-input-clear-btn');
    fireEvent.press(clearBtn);

    expect(input.props.value).toBe('');

    // Advance thời gian 1000ms - forwardGeocode không được gọi vì đã bị hủy
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(forwardSpy).not.toHaveBeenCalled();
  });

  it('Kịch bản 6: Chạm vào khu vực bản đồ khi input đang focus sẽ đóng bàn phím và nhả focus', () => {
    render(<CustomerBookingSelectAddressRoute />);
    const input = screen.getByTestId('booking-address-input');

    fireEvent(input, 'focus');
    keyboardDismissSpy.mockClear();

    const mapArea = screen.getByTestId('booking-select-address-screen');
    fireEvent(mapArea, 'touchStart');

    expect(keyboardDismissSpy).toHaveBeenCalled();
  });

  it('Kịch bản 7: Bấm nút định vị GPS (locate-me-btn) chủ động sẽ đóng bàn phím và cập nhật địa chỉ GPS', async () => {
    jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
      status: 'gps_success',
      isRealGps: true,
      coordinates: {
        latitude: 16.08,
        longitude: 108.15,
        addressText: 'GPS Landmark Đà Nẵng',
      },
    });

    render(<CustomerBookingSelectAddressRoute />);
    const input = screen.getByTestId('booking-address-input');

    const locateBtn = screen.getByTestId('locate-me-btn');
    fireEvent.press(locateBtn);

    expect(keyboardDismissSpy).toHaveBeenCalled();

    await waitFor(() => {
      expect(input.props.value).toBe('GPS Landmark Đà Nẵng');
      expect(mockFlyTo).toHaveBeenCalledWith({ latitude: 16.08, longitude: 108.15 }, 16);
    });
  });

  it('Kịch bản 8: Nhấn Enter/Submit trên bàn phím đóng bàn phím và kích hoạt forward geocode ngay lập tức', async () => {
    const forwardSpy = jest.spyOn(MapboxService, 'forwardGeocode').mockResolvedValue({
      latitude: 16.071,
      longitude: 108.153,
      placeName: 'Đại học Bách Khoa Đà Nẵng',
    });

    render(<CustomerBookingSelectAddressRoute />);
    const input = screen.getByTestId('booking-address-input');

    fireEvent.changeText(input, '54 Nguyễn Lương Bằng');
    keyboardDismissSpy.mockClear();

    fireEvent(input, 'submitEditing');

    expect(keyboardDismissSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(forwardSpy).toHaveBeenCalledWith('54 Nguyễn Lương Bằng', expect.any(Object));
      expect(mockFlyTo).toHaveBeenCalledWith({ latitude: 16.071, longitude: 108.153 }, 16);
    });
  });
});
