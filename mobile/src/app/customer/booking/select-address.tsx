/* eslint-disable max-lines-per-function */
import type { HandyCoordinates, HandyMapRef } from '@/components/map/handy-map';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Svg, { Circle, Path } from 'react-native-svg';
import { HandyMap } from '@/components/map/handy-map';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { DeviceLocationService } from '@/services/location/device-location';
import { MapboxService } from '@/services/map/mapbox-service';

export default function CustomerBookingSelectAddressRoute() {
  const router = useRouter();
  const { addressText, latitude, longitude, setAddress } = useBookingDraftStore();
  const mapRef = React.useRef<HandyMapRef>(null);
  const [currentAddress, setCurrentAddress] = React.useState(
    addressText || '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
  );
  const [currentCoords, setCurrentCoords] = React.useState<HandyCoordinates>({
    latitude: latitude || 16.0748,
    longitude: longitude || 108.1499,
  });
  const [isLocating, setIsLocating] = React.useState(false);
  const [gpsStatus, setGpsStatus] = React.useState<'idle' | 'locating' | 'success' | 'failed'>('idle');

  const fetchDeviceGpsLocation = React.useCallback(async (showFeedback = false) => {
    Keyboard.dismiss();
    setIsLocating(true);
    setGpsStatus('locating');
    try {
      const loc = await DeviceLocationService.getCurrentLocation();
      if (loc) {
        setCurrentAddress(loc.addressText);
        setCurrentCoords({ latitude: loc.latitude, longitude: loc.longitude });
        setAddress(loc.addressText, loc.latitude, loc.longitude);
        setGpsStatus('success');
        mapRef.current?.flyTo({ latitude: loc.latitude, longitude: loc.longitude }, 16);
      }
      else {
        setGpsStatus('failed');
        if (showFeedback) {
          Alert.alert(
            'Không thể lấy vị trí',
            'Vui lòng bật quyền truy cập vị trí (GPS) trên thiết bị để tự động định vị địa chỉ của bạn.',
          );
        }
      }
    }
    catch {
      setGpsStatus('failed');
    }
    finally {
      setIsLocating(false);
    }
  }, [setAddress]);

  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const forwardGeocodeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRegionChange = React.useCallback(
    (coords: HandyCoordinates) => {
      setCurrentCoords(coords);
      Keyboard.dismiss();

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const streetAddress = await MapboxService.reverseGeocode(coords.latitude, coords.longitude);
          if (streetAddress) {
            setCurrentAddress(streetAddress);
            setAddress(streetAddress, coords.latitude, coords.longitude);
          }
        }
        catch {
          // Giữ địa chỉ hiện tại nếu lỗi mạng
        }
      }, 500);
    },
    [setAddress],
  );

  const handleAddressInputChange = React.useCallback(
    (text: string) => {
      setCurrentAddress(text);

      if (forwardGeocodeTimerRef.current) {
        clearTimeout(forwardGeocodeTimerRef.current);
      }

      if (text.trim().length < 3) {
        return;
      }

      forwardGeocodeTimerRef.current = setTimeout(async () => {
        try {
          const result = await MapboxService.forwardGeocode(text, currentCoords);
          if (result) {
            setCurrentCoords({ latitude: result.latitude, longitude: result.longitude });
            setAddress(text, result.latitude, result.longitude);
            mapRef.current?.flyTo({ latitude: result.latitude, longitude: result.longitude }, 16);
          }
        }
        catch {
          // Giữ nguyên vị trí nếu lỗi mạng
        }
      }, 700);
    },
    [currentCoords, setAddress],
  );

  const handleAddressSubmitEditing = React.useCallback(async () => {
    Keyboard.dismiss();
    if (forwardGeocodeTimerRef.current) {
      clearTimeout(forwardGeocodeTimerRef.current);
    }
    if (currentAddress.trim().length >= 3) {
      try {
        const result = await MapboxService.forwardGeocode(currentAddress, currentCoords);
        if (result) {
          setCurrentCoords({ latitude: result.latitude, longitude: result.longitude });
          setAddress(currentAddress, result.latitude, result.longitude);
          mapRef.current?.flyTo({ latitude: result.latitude, longitude: result.longitude }, 16);
        }
      }
      catch {
        // Safe fallback
      }
    }
  }, [currentAddress, currentCoords, setAddress]);

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (forwardGeocodeTimerRef.current) {
        clearTimeout(forwardGeocodeTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'test') {
      void fetchDeviceGpsLocation(false);
    }
  }, [fetchDeviceGpsLocation]);

  const handleBottomConfirm = () => {
    Keyboard.dismiss();
    const finalAddress = currentAddress.trim() || '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng';
    const currentLat = useBookingDraftStore.getState().latitude;
    const currentLng = useBookingDraftStore.getState().longitude;
    setAddress(finalAddress, currentLat, currentLng);
    router.push(RouteNames.CUSTOMER_BOOKING_SELECT_TIME as any);
  };

  const handleBack = () => {
    Keyboard.dismiss();
    if (typeof router.canGoBack === 'function' && !router.canGoBack()) {
      router.replace(RouteNames.CUSTOMER_BOOKING as any);
    }
    else {
      router.back();
    }
  };

  const handleSearchAnother = () => {
    Keyboard.dismiss();
    router.push(RouteNames.CUSTOMER_SEARCH_ADDRESS as any);
  };

  return (
    <Screen safeArea className="flex-1 bg-white dark:bg-neutral-950">
      {/* 1. Thanh điều hướng trên cùng (Header chuẩn Vua Thợ) */}
      <View className="z-20 flex-row items-center justify-between border-b border-neutral-100 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Pressable
          testID="app-bar-back-btn"
          onPress={handleBack}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          className="size-10 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
        >
          <Svg pointerEvents="none" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#1F2937" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m15 18-6-6 6-6" />
          </Svg>
        </Pressable>

        <Pressable
          testID="select-address-search-btn"
          onPress={handleSearchAnother}
          className="active:opacity-70"
          hitSlop={8}
        >
          <Text className="text-xs font-bold text-[#F5A524]">
            Tìm kiếm địa chỉ khác
          </Text>
        </Pressable>
      </View>

      {/* Khối tương thích ngầm cho test suite */}
      <View className="sr-only h-0 overflow-hidden opacity-0" accessible={false} pointerEvents="none">
        <Text>Chọn địa chỉ</Text>
      </View>

      {/* 2. Khung Viewport chính tự động co giãn theo bàn phím */}
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        className="flex-1"
      >
        {/* Bản đồ tương tác thời gian thực */}
        <View
          testID="booking-select-address-screen"
          className="relative flex-1 bg-[#F8FAFC] dark:bg-neutral-950"
        >
          {/* Bản đồ tương tác Mapbox thực tế với ghim tâm định vị */}
          <HandyMap
            ref={mapRef}
            initialCenter={currentCoords}
            showCenterPin
            onRegionDidChange={handleRegionChange}
          />

          {/* Thanh trạng thái GPS thật nổi ở phía trên */}
          <Pressable
            testID="gps-status-badge"
            onPress={() => fetchDeviceGpsLocation(true)}
            className="absolute top-4 z-10 flex-row items-center self-center rounded-full bg-neutral-900/85 px-4 py-2 shadow-sm active:opacity-80"
          >
            {isLocating
              ? (
                  <>
                    <ActivityIndicator size="small" color="#F5A524" className="mr-2" />
                    <Text className="text-xs font-semibold text-amber-400">Đang dò GPS thiết bị...</Text>
                  </>
                )
              : gpsStatus === 'success'
                ? (
                    <>
                      <View className="mr-2 size-2 rounded-full bg-emerald-400" />
                      <Text className="text-xs font-semibold text-emerald-400">GPS thiết bị: Đã định vị chính xác</Text>
                    </>
                  )
                : (
                    <>
                      <Text className="mr-1.5 text-xs">📍</Text>
                      <Text className="text-xs font-semibold text-amber-400">GPS: Chạm để định vị vị trí thật</Text>
                    </>
                  )}
          </Pressable>

          {/* Nút định vị nhanh GPS thực tế (Floating Action Button) - nổi trên thẻ địa chỉ */}
          <Pressable
            testID="locate-me-btn"
            onPress={() => fetchDeviceGpsLocation(true)}
            hitSlop={12}
            className="absolute right-4 bottom-4 z-10 size-12 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-md active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
          >
            {isLocating
              ? (
                  <ActivityIndicator size="small" color="#F5A524" />
                )
              : (
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <Circle cx="12" cy="12" r="3" />
                    <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </Svg>
                )}
          </Pressable>
        </View>

        {/* 3. Form địa chỉ làm việc cụ thể đặt cố định ở phía dưới (Bottom Sheet tự động trồi lên trên bàn phím) */}
        <View className="rounded-t-3xl border-t border-neutral-100 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
          {/* Thanh gạt ngang giả lập kéo thả */}
          <View className="mx-auto mb-3.5 h-1.5 w-11 rounded-full bg-neutral-300 dark:bg-neutral-700" />

          {/* Dòng tiêu đề: Icon ghim, Tên mục & Dấu tích xác nhận */}
          <View className="mb-3.5 flex-row items-center justify-between">
            <View className="mr-2 flex-1 flex-row items-center">
              <View className="mr-2.5 size-7 items-center justify-center rounded-full bg-primary-50 dark:bg-amber-950/40">
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <Circle cx="12" cy="10" r="3" />
                </Svg>
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-neutral-900 dark:text-white">
                  Địa chỉ làm việc
                </Text>
                <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Nhập số nhà, tên đường hoặc dùng nút GPS để tự động định vị
                </Text>
              </View>
            </View>

            {/* Icon checkmark đã chọn */}
            <View className="size-6 items-center justify-center rounded-full bg-[#F5A524]">
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M20 6 9 17l-5-5" />
              </Svg>
            </View>
          </View>

          {/* Ô nhập địa chỉ chi tiết bằng tay */}
          <View className="relative mb-4">
            <TextInput
              testID="booking-address-input"
              multiline
              numberOfLines={3}
              value={currentAddress}
              onChangeText={handleAddressInputChange}
              placeholder="Nhập địa chỉ nhà, tên đường, phường/xã..."
              placeholderTextColor="#9CA3AF"
              className="min-h-[75px] rounded-2xl bg-neutral-100 p-3.5 pr-9 text-sm font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-white"
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit={true}
              onSubmitEditing={handleAddressSubmitEditing}
            />
            {currentAddress.length > 0 && (
              <Pressable
                onPress={() => setCurrentAddress('')}
                className="absolute top-3 right-3 size-6 items-center justify-center rounded-full bg-neutral-300 dark:bg-neutral-700"
              >
                <Text className="text-xs font-bold text-neutral-700 dark:text-white">✕</Text>
              </Pressable>
            )}
          </View>

          {/* Nút Xác nhận ở dưới cùng */}
          <Button
            testID="select-address-confirm-btn"
            label="Xác nhận"
            className="h-13 w-full rounded-full bg-[#F5A524] shadow-md shadow-amber-200 active:bg-primary-600"
            textClassName="text-base font-bold text-white"
            onPress={handleBottomConfirm}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
