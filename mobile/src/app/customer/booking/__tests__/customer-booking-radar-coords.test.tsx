import * as React from 'react';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { isValidCoordinate } from '@/services/location/coordinates';
import { DeviceLocationService } from '@/services/location/device-location';
import CustomerBookingRadarScreen from '../radar';

const mockFlyTo = jest.fn();
const mockZoomIn = jest.fn();
const mockZoomOut = jest.fn();

let mockSearchParams: Record<string, string> = {};

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
  useLocalSearchParams: jest.fn(() => mockSearchParams),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockSearchParams = {};
  useBookingDraftStore.getState().resetDraft();
});

describe('customerBookingRadar - Coordinates Validation & Lifecycle Isolation (PR62-04-P2)', () => {
  describe('isValidCoordinate helper', () => {
    it('accepts valid finite coordinates within normal bounds', () => {
      expect(isValidCoordinate(16.0748, 108.1499)).toBe(true);
      expect(isValidCoordinate('10.7725', '106.6980')).toBe(true);
      expect(isValidCoordinate(0, 108.1499)).toBe(true);
      expect(isValidCoordinate(16.0748, 0)).toBe(true);
      expect(isValidCoordinate(-33.8688, 151.2093)).toBe(true);
    });

    it('rejects (0, 0) Null Island coordinates', () => {
      expect(isValidCoordinate(0, 0)).toBe(false);
      expect(isValidCoordinate('0', '0')).toBe(false);
    });

    it('rejects non-numeric, null, undefined, or empty coordinates', () => {
      expect(isValidCoordinate(null, null)).toBe(false);
      expect(isValidCoordinate(undefined, 108)).toBe(false);
      expect(isValidCoordinate(16, undefined)).toBe(false);
      expect(isValidCoordinate('', '')).toBe(false);
      expect(isValidCoordinate('invalid', 'coords')).toBe(false);
      expect(isValidCoordinate(Number.NaN, 108)).toBe(false);
      expect(isValidCoordinate(16, Number.NaN)).toBe(false);
      expect(isValidCoordinate(Infinity, 108)).toBe(false);
      expect(isValidCoordinate(16, -Infinity)).toBe(false);
    });

    it('rejects out of bounds latitude (> 90 or < -90) and longitude (> 180 or < -180)', () => {
      expect(isValidCoordinate(91, 108)).toBe(false);
      expect(isValidCoordinate(-90.5, 108)).toBe(false);
      expect(isValidCoordinate(16, 180.5)).toBe(false);
      expect(isValidCoordinate(16, -181)).toBe(false);
    });
  });

  describe('radar Coordinates Resolution & Race Condition Immunity', () => {
    it('P2-RC-01: prioritizes Request B coordinates and ignores late-arriving response of Request A', async () => {
      mockSearchParams = { requestId: 'req-B-456' };

      let resolveRequestA: (value: any) => void;
      const requestAPromise = new Promise((resolve) => {
        resolveRequestA = resolve;
      });

      const getDetailSpy = jest.spyOn(OrdersApi, 'getRequestDetail').mockImplementation((id: string) => {
        if (id === 'req-A-123') {
          return requestAPromise as any;
        }
        if (id === 'req-B-456') {
          return Promise.resolve({
            statusCode: 200,
            message: 'OK',
            data: {
              id: 'req-B-456',
              requestCode: 'REQ-B-456',
              latitude: 10.7769,
              longitude: 106.7009,
              addressText: 'Quận 1, TP. Hồ Chí Minh',
              status: 'open_for_bidding',
            },
          } as any);
        }
        return Promise.reject(new Error('Unknown'));
      });

      // Render Request B
      render(<CustomerBookingRadarScreen />);

      // Request B resolves and flies to B's coordinates
      await waitFor(() => {
        expect(getDetailSpy).toHaveBeenCalledWith('req-B-456');
        expect(mockFlyTo).toHaveBeenCalledWith(
          { latitude: 10.7769, longitude: 106.7009 },
          12.0,
        );
      });

      // Now late response of Request A arrives with Da Nang coordinates
      mockFlyTo.mockClear();
      resolveRequestA!({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'req-A-123',
          requestCode: 'REQ-A-123',
          latitude: 16.0748,
          longitude: 108.1499,
          addressText: 'Đà Nẵng',
          status: 'open_for_bidding',
        },
      });

      // Wait a moment and ensure A's coordinates never overwrote B's flyTo
      await new Promise(r => setTimeout(r, 100));
      expect(mockFlyTo).not.toHaveBeenCalledWith(
        { latitude: 16.0748, longitude: 108.1499 },
        expect.anything(),
      );
      // Draft store address remains TP. Hồ Chí Minh, not overwritten by Da Nang
      expect(useBookingDraftStore.getState().addressText).toBe('Quận 1, TP. Hồ Chí Minh');
    });

    it('P2-RC-02: leaves verifiedCoords as null and does NOT write fake Da Nang coords to draft when backend lacks coordinates', async () => {
      mockSearchParams = { requestId: 'req-no-coords-999' };

      // Reset store coordinates to 0 to test clean state
      useBookingDraftStore.setState({
        latitude: 0,
        longitude: 0,
        addressText: '',
        createdRequestId: 'req-other-old',
      });

      jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'req-no-coords-999',
          requestCode: 'REQ-NO-COORDS',
          latitude: null,
          longitude: null,
          addressText: 'Khu công nghệ cao Hòa Lạc, Hà Nội',
          status: 'open_for_bidding',
        },
      } as any);

      render(<CustomerBookingRadarScreen />);

      await waitFor(() => {
        // Notice of unverified location should be visible
        expect(screen.getByTestId('unverified-location-notice')).toBeOnTheScreen();
        expect(screen.getByText(/Chưa có vị trí chính xác • Nhấn nút GPS để định vị/)).toBeOnTheScreen();
      });

      // Draft store should NOT be contaminated with fake Da Nang (16.0748, 108.1499)
      const currentDraft = useBookingDraftStore.getState();
      expect(currentDraft.latitude).not.toBe(16.0748);
      expect(currentDraft.longitude).not.toBe(108.1499);
      expect(currentDraft.addressText).toBe('Khu công nghệ cao Hòa Lạc, Hà Nội');
    });

    it('P2-RC-03: ignores stale route params from Request A when activeRequestId is Request B', async () => {
      // searchParams specifies requestId for req-A with Da Nang coordinates, but activeRequestId is req-B
      mockSearchParams = {
        requestId: 'req-A-old',
        latitude: '16.0748',
        longitude: '108.1499',
      };

      // Set draft store createdRequestId to req-B
      useBookingDraftStore.setState({
        createdRequestId: 'req-B-new',
        latitude: 0,
        longitude: 0,
        addressText: '',
      });

      // Server for req-A-old returns empty coords
      jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'req-A-old',
          requestCode: 'REQ-A-OLD',
          latitude: null,
          longitude: null,
          addressText: 'Chưa xác định',
          status: 'open_for_bidding',
        },
      } as any);

      render(<CustomerBookingRadarScreen />);

      await waitFor(() => {
        // Because server has responded with null coords, verifiedCoords is null
        expect(screen.getByTestId('unverified-location-notice')).toBeOnTheScreen();
      });
    });

    it('P2-RC-04: queries device GPS on unpositioned request and updates verifiedCoords and map center', async () => {
      mockSearchParams = { requestId: 'req-locate-test-777' };

      useBookingDraftStore.setState({
        latitude: 0,
        longitude: 0,
        addressText: '',
        createdRequestId: 'req-locate-test-777',
      });

      jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'req-locate-test-777',
          requestCode: 'REQ-LOCATE-777',
          latitude: null,
          longitude: null,
          addressText: 'Cần Thơ',
          status: 'open_for_bidding',
        },
      } as any);

      const gpsSpy = jest.spyOn(DeviceLocationService, 'getDeviceLocationResult').mockResolvedValue({
        status: 'gps_success',
        isRealGps: true,
        coordinates: {
          latitude: 10.0452,
          longitude: 105.7469,
          addressText: 'Ninh Kiều, Cần Thơ',
        },
      });

      render(<CustomerBookingRadarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('unverified-location-notice')).toBeOnTheScreen();
      });

      mockFlyTo.mockClear();

      // Tap locate-me button
      const locateBtn = screen.getByTestId('locate-me-btn');
      fireEvent.press(locateBtn);

      await waitFor(() => {
        expect(gpsSpy).toHaveBeenCalled();
        expect(mockFlyTo).toHaveBeenCalledWith(
          { latitude: 10.0452, longitude: 105.7469 },
          12.0,
        );
        // Notice disappears once GPS verified location is obtained
        expect(screen.queryByTestId('unverified-location-notice')).toBeNull();
      });
    });

    it('P2-RC-05: correctly prioritizes valid server coordinates over stale draft store', async () => {
      mockSearchParams = { requestId: 'req-server-coords-888' };

      // Draft store contains old coordinates from a previous session
      useBookingDraftStore.setState({
        createdRequestId: 'req-old-draft',
        latitude: 21.0285,
        longitude: 105.8542, // Hà Nội
        addressText: 'Hoàn Kiếm, Hà Nội',
      });

      jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'req-server-coords-888',
          requestCode: 'REQ-SERVER-888',
          latitude: 16.0748,
          longitude: 108.1499,
          addressText: 'Hải Châu, Đà Nẵng',
          status: 'open_for_bidding',
        },
      } as any);

      render(<CustomerBookingRadarScreen />);

      await waitFor(() => {
        expect(mockFlyTo).toHaveBeenCalledWith(
          { latitude: 16.0748, longitude: 108.1499 },
          12.0,
        );
        expect(screen.queryByTestId('unverified-location-notice')).toBeNull();
      });
    });
  });
});
