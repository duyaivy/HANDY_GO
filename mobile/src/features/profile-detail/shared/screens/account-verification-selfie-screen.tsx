/* eslint-disable max-lines-per-function */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { CameraIcon, CheckCircleIcon, SparklesIcon } from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export function AccountVerificationSelfieScreen() {
  const router = useRouter();
  const { idFront } = useLocalSearchParams<{ idFront?: string }>();
  const cameraRef = React.useRef<CameraView>(null);
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [isFillLightOn, setIsFillLightOn] = React.useState(false);
  const [capturedImageUri, setCapturedImageUri] = React.useState<string | null>(null);

  const ovalWidth = Math.min(width * 0.72, 290);
  const ovalHeight = Math.round(ovalWidth * 1.35);

  const handleCapture = async () => {
    if (!cameraReady || !cameraRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);
    try {
      // quality: 1.0 giữ độ sắc nét cao nhất cho mô hình AI InsightFace so khớp 1:1
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setCapturedImageUri(photo.uri);
      }
    }
    catch {
      Alert.alert('Không thể chụp ảnh', 'Vui lòng thử lại và nhìn thẳng vào camera.');
    }
    finally {
      setIsCapturing(false);
    }
  };

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted && !result.canAskAgain) {
      Alert.alert('Cần quyền camera', 'Hãy bật quyền camera cho HANDY GO trong phần Cài đặt của điện thoại.');
    }
  };

  const handleConfirm = () => {
    router.push({
      pathname: '/verification/submit',
      params: {
        idFront: idFront || '',
        selfie: capturedImageUri || '',
      },
    } as any);
  };

  return (
    <Screen safeArea className="bg-neutral-950">
      <View className="flex-1 bg-neutral-950">
        {/* Header Bar */}
        <View className="relative z-20 h-14 flex-row items-center justify-between border-b border-white/10 bg-neutral-950 px-4">
          <Pressable
            testID="kyc-selfie-back"
            accessibilityRole="button"
            accessibilityLabel="Quay lại chụp CCCD"
            onPress={() => router.back()}
            className="size-10 items-center justify-center rounded-full active:bg-white/10"
          >
            <ArrowLeft width={10} height={20} color="#FFFFFF" />
          </Pressable>
          <View className="items-center">
            <Text className="text-base font-semibold text-white">Xác minh khuôn mặt</Text>
            <Text className="mt-0.5 text-[10px] font-semibold tracking-wider text-sky-300 uppercase">Bước 2/2</Text>
          </View>
          {/* Nút bật/tắt Trợ sáng màn hình (Fill Light) khi chụp phòng tối */}
          {!capturedImageUri && permission?.granted
            ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isFillLightOn ? 'Tắt trợ sáng màn hình' : 'Bật trợ sáng màn hình'}
                  onPress={() => setIsFillLightOn(prev => !prev)}
                  className={`size-10 items-center justify-center rounded-full border transition-colors ${
                    isFillLightOn
                      ? 'border-amber-300 bg-amber-400/25 active:bg-amber-400/35'
                      : 'border-white/15 bg-white/5 active:bg-white/10'
                  }`}
                >
                  <SparklesIcon color={isFillLightOn ? '#FDE047' : '#9CA3AF'} size={18} />
                </Pressable>
              )
            : (
                <View className="size-10" />
              )}
        </View>

        {capturedImageUri
          ? (
              /* Màn hình xem lại ảnh selfie */
              <View className="flex-1 justify-between px-5 pt-5 pb-4">
                <View className="flex-row items-center gap-3">
                  <View className="size-11 items-center justify-center rounded-full bg-emerald-400/15">
                    <CheckCircleIcon color="#34D399" size={24} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-white">Ảnh khuôn mặt</Text>
                    <Text className="mt-0.5 text-xs/4 text-neutral-300">Đảm bảo khuôn mặt rõ nét, không bị lóa hoặc che khuất</Text>
                  </View>
                </View>

                <View className="w-full items-center">
                  <View
                    className="overflow-hidden rounded-full border-2 border-sky-400 shadow-2xl"
                    style={{ width: ovalWidth, height: ovalHeight }}
                  >
                    <Image
                      testID="kyc-selfie-preview"
                      source={{ uri: capturedImageUri }}
                      contentFit="cover"
                      className="size-full"
                    />
                  </View>
                </View>

                <View className="gap-2.5">
                  <Button
                    testID="kyc-selfie-confirm"
                    label="Dùng ảnh này"
                    size="lg"
                    className="h-12 rounded-xl bg-blue-600 active:bg-blue-700"
                    onPress={handleConfirm}
                  />
                  <Button
                    testID="kyc-selfie-retake"
                    label="Chụp lại"
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-xl border-white/30 bg-white/5"
                    textClassName="text-white"
                    onPress={() => setCapturedImageUri(null)}
                  />
                </View>
              </View>
            )
          : permission?.granted
            ? (
                /* Camera trước Full Screen kèm Oval Frame & Fill Light */
                <View className="relative flex-1 overflow-hidden">
                  <CameraView
                    ref={cameraRef}
                    testID="kyc-selfie-camera"
                    facing="front"
                    mode="picture"
                    autofocus="on"
                    onCameraReady={() => setCameraReady(true)}
                    onMountError={() => Alert.alert('Không thể mở camera', 'Hãy thử lại sau.')}
                    style={StyleSheet.absoluteFillObject}
                  />

                  {/* Lớp phủ màn hình: Nếu bật Fill Light thì dùng nền trắng sáng để hắt sáng mặt */}
                  <View
                    className={`flex-1 justify-between transition-colors ${
                      isFillLightOn ? 'bg-amber-50/90' : 'bg-black/40'
                    }`}
                  >
                    {/* Header tips */}
                    <View className="items-center px-6 pt-5">
                      <Text
                        className={`text-center text-base font-semibold ${
                          isFillLightOn ? 'text-neutral-900' : 'text-white'
                        }`}
                      >
                        Đặt khuôn mặt vào vùng oval
                      </Text>
                      <Text
                        className={`mt-1.5 text-center text-xs/4 ${
                          isFillLightOn ? 'font-medium text-neutral-700' : 'text-white/80'
                        }`}
                      >
                        Nhìn thẳng, bỏ khẩu trang/kính râm và giữ điện thoại ngang tầm mắt
                      </Text>
                    </View>

                    {/* Khung oval hướng dẫn */}
                    <View className="items-center" pointerEvents="none">
                      <View
                        testID="kyc-selfie-oval-guide"
                        accessibilityLabel="Khung oval căn chỉnh khuôn mặt"
                        className={`rounded-full border-[3px] bg-transparent shadow-2xl ${
                          isFillLightOn ? 'border-amber-500' : 'border-sky-300'
                        }`}
                        style={{ width: ovalWidth, height: ovalHeight }}
                      />
                      <Text
                        className={`mt-3 text-center text-xs font-semibold ${
                          isFillLightOn ? 'text-amber-900' : 'text-sky-200'
                        }`}
                      >
                        {isFillLightOn ? '💡 Đang bật trợ sáng màn hình' : 'Mặt chính diện, biểu cảm tự nhiên'}
                      </Text>
                    </View>

                    {/* Bottom Shutter Action Bar */}
                    <View
                      className={`items-center border-t px-5 pt-4 pb-6 backdrop-blur-md ${
                        isFillLightOn ? 'border-neutral-200 bg-white/80' : 'border-white/10 bg-black/60'
                      }`}
                    >
                      <Pressable
                        testID="kyc-selfie-capture"
                        accessibilityRole="button"
                        accessibilityLabel="Chụp ảnh khuôn mặt"
                        disabled={!cameraReady || isCapturing}
                        onPress={() => void handleCapture()}
                        className={`size-[76px] items-center justify-center rounded-full border-[3px] border-white active:scale-95 ${
                          isFillLightOn ? 'bg-neutral-800' : 'bg-white/20'
                        } ${!cameraReady || isCapturing ? 'opacity-50' : 'opacity-100'}`}
                      >
                        <View className="size-[60px] items-center justify-center rounded-full bg-white shadow-lg">
                          {isCapturing ? <ActivityIndicator color="#0284C7" size="small" /> : <CameraIcon color="#0284C7" size={24} />}
                        </View>
                      </Pressable>
                      <Text
                        className={`mt-2 text-xs ${isFillLightOn ? 'font-medium text-neutral-800' : 'text-white/80'}`}
                      >
                        {isCapturing ? 'Đang chụp chân dung...' : 'Nhấn nút để chụp ảnh'}
                      </Text>
                    </View>
                  </View>
                </View>
              )
            : (
                /* Trạng thái chưa cấp quyền */
                <View className="flex-1 items-center justify-center px-8">
                  <View className="size-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <CameraIcon color="#BAE6FD" size={32} />
                  </View>
                  <Text className="mt-5 text-center text-lg font-bold text-white">
                    {permission ? 'Cần quyền truy cập camera' : 'Đang kiểm tra camera'}
                  </Text>
                  <Text className="mt-2 text-center text-sm/5 text-neutral-300">
                    {permission
                      ? 'Cho phép camera để chụp ảnh khuôn mặt trực tiếp với độ nét cao.'
                      : 'Vui lòng đợi trong giây lát.'}
                  </Text>
                  {permission?.canAskAgain && (
                    <Button
                      testID="kyc-selfie-grant-permission"
                      label="Bật camera"
                      size="lg"
                      className="mt-6 h-12 rounded-xl bg-blue-600"
                      onPress={() => void handleRequestPermission()}
                    />
                  )}
                </View>
              )}
      </View>
    </Screen>
  );
}
