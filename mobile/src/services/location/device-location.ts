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
      return true;
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
   * Lấy tọa độ GPS thật của thiết bị và tự động dịch thành địa chỉ đường phố (Reverse Geocoding)
   * Nếu build hiện tại chưa có native module ExpoLocation, fallback an toàn sang tọa độ mặc định để không làm đơ/treo ứng dụng.
   */
  async getCurrentLocation(): Promise<DeviceCoordinates | null> {
    const Location = getLocationModule();
    if (!Location) {
      console.warn(
        '[DeviceLocationService] Native module ExpoLocation chưa có trong APK hiện tại. Tự động trả về tọa độ mặc định hợp lệ.',
      );
      return DEFAULT_DEVICE_COORDINATES;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        return null;
      }

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
        latitude,
        longitude,
        addressText,
      };
    }
    catch (error) {
      console.warn('[DeviceLocationService] Lỗi khi đọc GPS thiết bị:', error);
      return DEFAULT_DEVICE_COORDINATES;
    }
  },
};
