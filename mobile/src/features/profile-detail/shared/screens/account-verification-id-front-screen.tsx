/* eslint-disable max-lines-per-function */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { CameraIcon, CheckCircleIcon } from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

const ID_CARD_ASPECT_RATIO = 1.586;

type CapturedImage = {
  uri: string;
  width: number;
  height: number;
};

async function cropToIdFrame(image: CapturedImage) {
  let cropWidth = image.width;
  let cropHeight = image.height;

  if (image.width / image.height > ID_CARD_ASPECT_RATIO) {
    cropWidth = Math.round(image.height * ID_CARD_ASPECT_RATIO);
  }
  else {
    cropHeight = Math.round(image.width / ID_CARD_ASPECT_RATIO);
  }

  const originX = Math.floor((image.width - cropWidth) / 2);
  const originY = Math.floor((image.height - cropHeight) / 2);
  const croppedImage = await ImageManipulator
    .manipulate(image.uri)
    .crop({ originX, originY, width: cropWidth, height: cropHeight })
    .renderAsync();

  return (await croppedImage.saveAsync({ compress: 0.95 })).uri;
}

export function AccountVerificationIdFrontScreen() {
  const router = useRouter();
  const cameraRef = React.useRef<CameraView>(null);
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [capturedImageUri, setCapturedImageUri] = React.useState<string | null>(null);
  const frameWidth = Math.min(width - 40, width * 0.9);
  const frameHeight = frameWidth / ID_CARD_ASPECT_RATIO;

  const handleCapture = async () => {
    if (!cameraReady || !cameraRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.95 });
      if (photo?.uri) {
        const imageUri = await cropToIdFrame(photo);
        setCapturedImageUri(imageUri);
      }
    }
    catch {
      Alert.alert('Không thể chụp ảnh', 'Vui lòng thử lại và giữ CCCD trọn trong khung.');
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

  const handleRetake = () => {
    setCapturedImageUri(null);
    setCameraReady(false);
  };

  const handleConfirm = () => {
    router.push({
      pathname: '/verification/selfie',
      params: { idFront: capturedImageUri || '' },
    } as any);
  };

  return (
    <Screen safeArea className="bg-neutral-950">
      <View className="flex-1 bg-neutral-950">
        <View className="relative z-10 h-14 flex-row items-center justify-center border-b border-white/10 bg-neutral-950 px-4">
          <Pressable
            testID="kyc-id-front-back"
            accessibilityRole="button"
            accessibilityLabel="Quay lại hướng dẫn"
            onPress={() => router.back()}
            className="absolute left-4 size-10 items-center justify-center rounded-full active:bg-white/10"
          >
            <ArrowLeft width={10} height={20} color="#FFFFFF" />
          </Pressable>
          <View className="items-center">
            <Text className="text-base font-semibold text-white">Chụp CCCD</Text>
            <Text className="mt-0.5 text-[10px] font-semibold tracking-wider text-sky-300 uppercase">Mặt trước · Bước 1/2</Text>
          </View>
        </View>

        {capturedImageUri
          ? (
              <View className="flex-1 justify-between px-5 pt-5 pb-4">
                <View className="flex-row items-center gap-3">
                  <View className="size-11 items-center justify-center rounded-full bg-emerald-400/15">
                    <CheckCircleIcon color="#34D399" size={24} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-white">Ảnh CCCD mặt trước</Text>
                    <Text className="mt-0.5 text-xs/4 text-neutral-300">Kiểm tra ảnh rõ nét và đủ bốn góc</Text>
                  </View>
                </View>

                <View
                  testID="kyc-id-front-preview-frame"
                  className="w-full overflow-hidden rounded-2xl border border-white/15 bg-black"
                  style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
                >
                  <Image
                    testID="kyc-id-front-preview"
                    source={{ uri: capturedImageUri }}
                    contentFit="contain"
                    className="size-full"
                  />
                </View>

                <View className="gap-2.5">
                  <Button
                    testID="kyc-id-front-confirm"
                    label="Dùng ảnh này"
                    size="lg"
                    className="h-12 rounded-xl bg-blue-600 active:bg-blue-700"
                    onPress={handleConfirm}
                  />
                  <Button
                    testID="kyc-id-front-retake"
                    label="Chụp lại"
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-xl border-white/30 bg-white/5"
                    textClassName="text-white"
                    onPress={handleRetake}
                  />
                </View>
              </View>
            )
          : permission?.granted
            ? (
                <View className="flex-1 justify-between px-5 pt-4 pb-5">
                  <View className="items-center">
                    <View className="flex-row items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5">
                      <CameraIcon color="#BAE6FD" size={14} />
                      <Text className="text-[11px] font-semibold text-white">CAMERA SAU</Text>
                    </View>
                    <Text className="mt-3 text-center text-sm font-medium text-white">Đặt CCCD trên mặt phẳng, đủ sáng</Text>
                  </View>

                  <View
                    testID="kyc-id-front-frame"
                    accessibilityLabel="Khung căn chỉnh CCCD tỷ lệ 1.586 trên 1"
                    className="relative self-center overflow-hidden rounded-xl border-2 border-white/90 bg-neutral-900"
                    style={{ width: frameWidth, height: frameHeight }}
                  >
                    <CameraView
                      ref={cameraRef}
                      testID="kyc-id-front-camera"
                      facing="back"
                      mode="picture"
                      onCameraReady={() => setCameraReady(true)}
                      onMountError={() => Alert.alert('Không thể mở camera', 'Hãy thử lại sau.')}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View className="absolute top-2 left-2 size-5 rounded-tl-md border-t-[3px] border-l-[3px] border-sky-300" />
                    <View className="absolute top-2 right-2 size-5 rounded-tr-md border-t-[3px] border-r-[3px] border-sky-300" />
                    <View className="absolute bottom-2 left-2 size-5 rounded-bl-md border-b-[3px] border-l-[3px] border-sky-300" />
                    <View className="absolute right-2 bottom-2 size-5 rounded-br-md border-r-[3px] border-b-[3px] border-sky-300" />
                  </View>

                  <View className="items-center border-t border-white/10 bg-black/35 pt-4">
                    <Pressable
                      testID="kyc-id-front-capture"
                      accessibilityRole="button"
                      accessibilityLabel="Chụp CCCD mặt trước"
                      disabled={!cameraReady || isCapturing}
                      onPress={() => void handleCapture()}
                      className={`size-[76px] items-center justify-center rounded-full border-[3px] border-white bg-white/15 ${!cameraReady || isCapturing ? 'opacity-50' : 'opacity-100'}`}
                    >
                      <View className="size-[60px] rounded-full bg-white" />
                    </Pressable>
                    <Text className="mt-2 text-xs text-white/75">
                      {isCapturing ? 'Đang căn chỉnh ảnh...' : 'Giữ trọn bốn góc trong khung'}
                    </Text>
                  </View>
                </View>
              )
            : (
                <View className="flex-1 items-center justify-center px-8">
                  <View className="size-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <CameraIcon color="#BAE6FD" size={32} />
                  </View>
                  <Text className="mt-5 text-center text-lg font-bold text-white">
                    {permission ? 'Cần quyền truy cập camera' : 'Đang kiểm tra camera'}
                  </Text>
                  <Text className="mt-2 text-center text-sm/5 text-neutral-300">
                    {permission
                      ? 'Cho phép camera để chụp trực tiếp CCCD mặt trước.'
                      : 'Vui lòng đợi trong giây lát.'}
                  </Text>
                  {permission?.canAskAgain && (
                    <Button
                      testID="kyc-id-front-grant-permission"
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
