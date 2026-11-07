import * as React from 'react';
import { Alert } from 'react-native';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { DeviceLocationService } from '@/services/location/device-location';
import CustomerBookingRadarScreen from '../radar';

const mockFlyTo = jest.fn();
const mockZoomIn = jest.fn();
const mockZoomOut = jest.fn();

jest.mock('@/components/map/handy-map', () => {
  const React = require('react');
  return {
    HandyMap: ({ ref }: any) => {
      React.useImperativeHandle(ref, () => ({
        flyTo: mockFlyTo,
        zoomIn: mockZoomIn,
        zoomOut: mockZoomOut,
      }));
      return null;
    },
  };
});

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/services/location/device-location', () => ({
  DeviceLocationService: {
    getDeviceLocationResult: jest.fn().mockResolvedValue({
      status: 'gps_success',
      isRealGps: true,
      coordinates: {
        latitude: 16.0748,
        longitude: 108.1499,
        addressText: 'Đà Nẵng',
      },
    }),
  },
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useBookingDraftStore.getState().resetDraft();
});

describe('customerBookingRadarScreen locate-me button', () => {
  it('automatically triggers flyTo to radarCoords at zoom 14.5 upon screen mount', async () => {
    useBookingDraftStore.setState({
      latitude: 16.0748,
      longitude: 108.1499,
      addressText: '54 Nguyễn Lương Bằng, Đà Nẵng',
      createdRequestId: 'req-test-123',
    });

    render(<CustomerBookingRadarScreen />);

    await waitFor(() => {
      expect(mockFlyTo).toHaveBeenCalledWith(
        {
          latitude: 16.0748,
          longitude: 108.1499,
        },
        14.5,
      );
    });
  });

  it('renders locate-me-btn and triggers flyTo to radarCoords on press with zoom 14.5', async () => {
    useBookingDraftStore.setState({
      latitude: 16.0748,
      longitude: 108.1499,
      addressText: '54 Nguyễn Lương Bằng, Đà Nẵng',
      createdRequestId: 'req-test-123',
    });

    render(<CustomerBookingRadarScreen />);

    const locateBtn = screen.getByTestId('locate-me-btn');
    expect(locateBtn).toBeTruthy();

    fireEvent.press(locateBtn);

    await waitFor(() => {
      expect(mockFlyTo).toHaveBeenCalledWith(
        {
          latitude: 16.0748,
          longitude: 108.1499,
        },
        14.5,
      );
    });
  });

  it('triggers zoomIn and zoomOut on pressing zoom buttons', async () => {
    useBookingDraftStore.setState({
      latitude: 16.0748,
      longitude: 108.1499,
      addressText: '54 Nguyễn Lương Bằng, Đà Nẵng',
      createdRequestId: 'req-test-123',
    });

    render(<CustomerBookingRadarScreen />);

    const zoomInBtn = screen.getByTestId('radar-zoom-in-btn');
    const zoomOutBtn = screen.getByTestId('radar-zoom-out-btn');
    expect(zoomInBtn).toBeTruthy();
    expect(zoomOutBtn).toBeTruthy();

    fireEvent.press(zoomInBtn);
    expect(mockZoomIn).toHaveBeenCalledTimes(1);

    fireEvent.press(zoomOutBtn);
    expect(mockZoomOut).toHaveBeenCalledTimes(1);
  });

  it('P2-01: actively queries real GPS when request lacks coordinates', async () => {
    // Không có tọa độ trong store
    useBookingDraftStore.setState({
      latitude: 0,
      longitude: 0,
      addressText: '',
      createdRequestId: 'req-no-coords-123',
    });

    const gpsSpy = jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
      status: 'gps_success',
      isRealGps: true,
      coordinates: {
        latitude: 10.7725,
        longitude: 106.6980,
        addressText: 'Quận 1, TP. Hồ Chí Minh',
      },
    });

    render(<CustomerBookingRadarScreen />);
    mockFlyTo.mockClear();

    const locateBtn = screen.getByTestId('locate-me-btn');
    fireEvent.press(locateBtn);

    await waitFor(() => {
      expect(gpsSpy).toHaveBeenCalled();
      expect(mockFlyTo).toHaveBeenCalledWith(
        {
          latitude: 10.7725,
          longitude: 106.6980,
        },
        14.5,
      );
    });
  });

  it('P2-01: alerts user when GPS permission is denied on unpositioned request', async () => {
    useBookingDraftStore.setState({
      latitude: 0,
      longitude: 0,
      addressText: '',
      createdRequestId: 'req-no-coords-123',
    });

    jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
      status: 'permission_denied',
      isRealGps: false,
      coordinates: null,
    });
    const alertSpy = jest.spyOn(Alert, 'alert');

    render(<CustomerBookingRadarScreen />);

    const locateBtn = screen.getByTestId('locate-me-btn');
    fireEvent.press(locateBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Quyền truy cập bị từ chối',
        expect.stringContaining('cài đặt thiết bị'),
      );
    });
  });
});
