import { NativeModules } from 'react-native';
import Env from '@/../env';
import { Logger } from '../logger/logger';

let isInitialized = false;
let cachedMapbox: any = null;

const DEFAULT_STYLES = {
  street: 'mapbox://styles/mapbox/streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
};

export const MapboxService = {
  /**
   * Kiểm tra xem native module của Mapbox có khả dụng trong runtime hiện tại không
   * (true trong Jest test hoặc khi app đã được prebuild/compile cùng @rnmapbox/maps native SDK)
   */
  isNativeSupported(): boolean {
    if (process.env.NODE_ENV === 'test') {
      return true;
    }
    return Boolean(NativeModules && NativeModules.RNMBXModule);
  },

  /**
   * Lấy instance Mapbox an toàn mà không làm crash app trên Expo Go / Dev Client chưa build
   */
  getMapbox(): any | null {
    if (cachedMapbox) {
      return cachedMapbox;
    }
    if (!this.isNativeSupported()) {
      return null;
    }
    try {
      const mod = require('@rnmapbox/maps');
      cachedMapbox = mod?.default ?? mod;
      return cachedMapbox;
    }
    catch (error) {
      Logger.warn('MapboxService', 'Không thể load module native @rnmapbox/maps:', error);
      return null;
    }
  },

  /**
   * Khởi tạo Access Token và cấu hình mặc định cho Mapbox SDK
   */
  init(): boolean {
    if (isInitialized) {
      return true;
    }

    const Mapbox = this.getMapbox();
    if (!Mapbox) {
      Logger.debug(
        'MapboxService',
        'Mapbox native module chưa sẵn sàng (đang chạy Expo Go hoặc chưa prebuild native). Sử dụng fallback UI.',
      );
      return false;
    }

    const token = Env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      Logger.warn('MapboxService', 'Chưa cấu hình EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN trong .env');
      return false;
    }

    try {
      if (typeof Mapbox.setAccessToken === 'function') {
        Mapbox.setAccessToken(token);
      }
      if (typeof Mapbox.setTelemetryEnabled === 'function') {
        Mapbox.setTelemetryEnabled(false);
      }
      isInitialized = true;
      Logger.debug('MapboxService', 'Mapbox SDK khởi tạo thành công');
      return true;
    }
    catch (error) {
      Logger.error('MapboxService', 'Lỗi khi khởi tạo Mapbox SDK', error);
      return false;
    }
  },

  /**
   * Kiểm tra xem Mapbox SDK đã được khởi tạo với Access Token hợp lệ chưa
   */
  isReady(): boolean {
    return isInitialized;
  },

  /**
   * Chuyển đổi tọa độ GPS thành địa chỉ đường phố cụ thể (Reverse Geocoding)
   * Sử dụng Mapbox Geocoding API với Access Token của dự án
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
    const token = Env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      return null;
    }

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${encodeURIComponent(token)}&language=vi`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const features = data?.features;
      if (Array.isArray(features) && features.length > 0) {
        const place = features[0];
        const raw = place.place_name_vi || place.place_name || place.text_vi || place.text;
        if (raw) {
          return raw.replace(/,\s*\d{5,6}\b/g, '').trim();
        }
      }
      return null;
    }
    catch (error) {
      Logger.warn('MapboxService', 'Lỗi khi gọi Mapbox Reverse Geocoding API:', error);
      return null;
    }
  },

  /**
   * Chuyển đổi địa chỉ nhập tự do thành tọa độ GPS (Forward Geocoding)
   * Sử dụng Mapbox Geocoding API với Access Token của dự án
   */
  async forwardGeocode(
    query: string,
    proximity?: { latitude: number; longitude: number },
  ): Promise<{ latitude: number; longitude: number; placeName: string } | null> {
    const token = Env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token || !query || query.trim().length < 3) {
      return null;
    }

    try {
      let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${encodeURIComponent(token)}&language=vi&country=vn&limit=1`;
      if (proximity && typeof proximity.latitude === 'number' && typeof proximity.longitude === 'number') {
        url += `&proximity=${proximity.longitude},${proximity.latitude}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const features = data?.features;
      if (Array.isArray(features) && features.length > 0) {
        const place = features[0];
        const coords = place.center || place.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const [longitude, latitude] = coords;
          if (typeof latitude === 'number' && typeof longitude === 'number') {
            const raw = place.place_name_vi || place.place_name || place.text_vi || place.text;
            const placeName = raw ? raw.replace(/,\s*\d{5,6}\b/g, '').trim() : query.trim();
            return { latitude, longitude, placeName };
          }
        }
      }
      return null;
    }
    catch (error) {
      Logger.warn('MapboxService', 'Lỗi khi gọi Mapbox Forward Geocoding API:', error);
      return null;
    }
  },

  /**
   * Mapbox Style URLs chuẩn
   */
  get styles() {
    const Mapbox = this.getMapbox();
    return {
      street: Mapbox?.StyleURL?.Street ?? DEFAULT_STYLES.street,
      outdoors: Mapbox?.StyleURL?.Outdoors ?? DEFAULT_STYLES.outdoors,
      light: Mapbox?.StyleURL?.Light ?? DEFAULT_STYLES.light,
      dark: Mapbox?.StyleURL?.Dark ?? DEFAULT_STYLES.dark,
      satellite: Mapbox?.StyleURL?.Satellite ?? DEFAULT_STYLES.satellite,
    };
  },
};
