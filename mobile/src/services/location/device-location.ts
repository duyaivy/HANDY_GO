import type * as LocationType from 'expo-location';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { MapboxService } from '../map/mapbox-service';

export type DeviceCoordinates = {
  latitude: number;
  longitude: number;
  addressText: string;
};

export const DEFAULT_DEVICE_COORDINATES: DeviceCoordinates = {
  latitude: 16.0748,
  longitude: 108.1499,
  addressText: '54 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
};

export type LocationStatus
  = | 'gps_success'
    | 'permission_denied'
    | 'module_missing'
    | 'gps_error';

export type DeviceLocationResult = {
  status: LocationStatus;
  isRealGps: boolean;
  coordinates: DeviceCoordinates | null;
  errorMessage?: string;
};

/**
 * Helper nạp module expo-location an toàn.
 * Tránh ném uncaught exception tại thời điểm nạp bundle nếu APK hiện tại chưa được biên dịch kèm native module 'ExpoLocation'.
 */
function getLocationModule(): typeof LocationType | null {
  try {
    const nativeLocation = requireOptionalNativeModule('ExpoLocation');
    if (!nativeLocation) {
      return null;
    }
    return require('expo-location');
  }
  catch {
    return null;
  }
}

export const DeviceLocationService = {
  /**
   * Kiểm tra xem native module ExpoLocation có sẵn trong APK hiện tại không
   */
  isNativeSupported(): boolean {
    return getLocationModule() !== null;
  },

  /**
   * Yêu cầu người dùng cấp quyền truy cập vị trí thiết bị (Foreground Location)
   */
  async requestPermission(): Promise<boolean> {
    const Location = getLocationModule();
    if (!Location) {
      console.warn(
        '[DeviceLocationService] Native module ExpoLocation chưa được nạp trong APK. Sử dụng fallback.',
      );
      return false;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === Location.PermissionStatus.GRANTED;
    }
    catch (error) {
      console.warn('[DeviceLocationService] Lỗi khi yêu cầu quyền vị trí:', error);
      return false;
    }
  },

  /**
   * Lấy kết quả định vị chi tiết, phân biệt rõ:
   * - 'gps_success': GPS thật thành công (isRealGps = true)
   * - 'permission_denied': Người dùng từ chối quyền truy cập vị trí
   * - 'module_missing': Bản dựng thiếu native module ExpoLocation
   * - 'gps_error': Lỗi phần cứng/mạng/tín hiệu GPS
   */
  async getDeviceLocationResult(): Promise<DeviceLocationResult> {
    const Location = getLocationModule();
    if (!Location) {
      return {
        status: 'module_missing',
        isRealGps: false,
        coordinates: null,
        errorMessage: 'Native module ExpoLocation chưa được tích hợp trong bản dựng.',
      };
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        return {
          status: 'permission_denied',
          isRealGps: false,
          coordinates: null,
          errorMessage: 'Người dùng từ chối cấp quyền truy cập vị trí.',
        };
      }
    }
    catch (err: unknown) {
      return {
        status: 'permission_denied',
        isRealGps: false,
        coordinates: null,
        errorMessage: (err as Error)?.message || 'Lỗi khi yêu cầu quyền vị trí.',
      };
    }

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = position.coords;
      let addressText = '';

      // 1. Ưu tiên Mapbox Reverse Geocoding vì độ chính xác tên đường phố tại VN rất cao
      try {
        const mapboxAddress = await MapboxService.reverseGeocode(latitude, longitude);
        if (mapboxAddress) {
          addressText = mapboxAddress;
        }
      }
      catch {
        // Fallback sang các phương thức khác
      }

      // 2. Dự phòng bằng Expo Location native reverseGeocode
      if (!addressText) {
        try {
          const geocoded = await Location.reverseGeocodeAsync({
            latitude,
            longitude,
          });

          if (geocoded && geocoded.length > 0) {
            const item = geocoded[0];
            const streetPart = item.streetNumber
              ? `${item.streetNumber} ${item.street || ''}`.trim()
              : item.street || item.name;
            const districtPart = item.district || item.subregion;
            const cityPart = item.city || item.region;

            const parts = [streetPart, districtPart, cityPart].filter(Boolean);
            addressText = parts.join(', ');
          }
        }
        catch {
          // Trong trường hợp mạng yếu hoặc dịch vụ geocoding chậm
        }
      }

      if (!addressText) {
        addressText = `Tọa độ: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }

      return {
        status: 'gps_success',
        isRealGps: true,
        coordinates: {
          latitude,
          longitude,
          addressText,
        },
      };
    }
    catch (error: unknown) {
      return {
        status: 'gps_error',
        isRealGps: false,
        coordinates: null,
        errorMessage: (error as Error)?.message || 'Lỗi khi đọc tín hiệu GPS thiết bị.',
      };
    }
  },

  /**
   * Lấy tọa độ GPS thật của thiết bị và tự động dịch thành địa chỉ đường phố.
   * Chỉ trả về tọa độ khi GPS thật thành công, hoặc khi `allowFallback: true`.
   */
  async getCurrentLocation(options?: { allowFallback?: boolean }): Promise<DeviceCoordinates | null> {
    const res = await this.getDeviceLocationResult();
    if (res.status === 'gps_success' && res.coordinates) {
      return res.coordinates;
    }
    if (options?.allowFallback) {
      return DEFAULT_DEVICE_COORDINATES;
    }
    return null;
  },
};
