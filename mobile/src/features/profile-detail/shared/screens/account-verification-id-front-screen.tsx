/* eslint-disable max-lines-per-function */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import {
  CameraIcon,
  CheckCircleIcon,
  FlashIcon,
  FlashOffIcon,
} from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

const ID_CARD_ASPECT_RATIO = 1.586;
const TOP_TIPS_HEIGHT = 56;
const BOTTOM_BAR_HEIGHT = 140;

type CapturedImage = {
  uri: string;
  width: number;
  height: number;
};

type ViewportLayout = {
  width: number;
  height: number;
};

type FrameCoordinates = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Cắt ảnh căn cước công dân khớp chính xác 100% với khung ngắm mà người dùng nhìn thấy trên màn hình.
 * Tự động đồng bộ tỷ lệ hiển thị AspectFill (cover) và xoay ảnh nếu cảm biến trả ảnh ngang.
 */
async function cropToIdFrame(
  image: CapturedImage,
  cameraLayout: ViewportLayout,
  frame: FrameCoordinates
): Promise<string> {
  const viewW = cameraLayout.width;
  const viewH = cameraLayout.height;

  if (viewW <= 0 || viewH <= 0 || frame.width <= 0 || frame.height <= 0) {
    return image.uri;
  }

  let currentUri = image.uri;
  let pw = image.width;
  let ph = image.height;

  // Nếu ảnh trả về ngang trong khi màn hình đang ở hướng dọc: xoay 90 độ
  if (pw > ph && viewW < viewH) {
    const rotated = await manipulateAsync(
      currentUri,
      [{ rotate: 90 }],
      { compress: 1.0, format: SaveFormat.JPEG }
    );
    currentUri = rotated.uri;
    pw = rotated.width;
    ph = rotated.height;
  }

  // Camera preview trên điện thoại sử dụng chế độ AspectFill (cover)
  const scale = Math.max(viewW / pw, viewH / ph);
  const renderedW = pw * scale;
  const renderedH = ph * scale;

  const offsetX = (renderedW - viewW) / 2;
  const offsetY = (renderedH - viewH) / 2;

  // Chuyển đổi tọa độ khung ngắm trên màn hình sang tọa độ điểm ảnh gốc của cảm biến
  const rawCropX = (frame.x + offsetX) / scale;
  const rawCropY = (frame.y + offsetY) / scale;
  const rawCropW = frame.width / scale;
  const rawCropH = frame.height / scale;

  // Biên đệm an toàn 2.5% cân đối 4 phía để thẻ không bị chạm sát mép
  const padX = rawCropW * 0.025;
  const padY = padX / ID_CARD_ASPECT_RATIO;

  let originX = Math.max(0, Math.floor(rawCropX - padX));
  let originY = Math.max(0, Math.floor(rawCropY - padY));
  let cropW = Math.round(rawCropW + padX * 2);
  let cropH = Math.round(cropW / ID_CARD_ASPECT_RATIO);

  // Đảm bảo không vượt quá biên của cảm biến
  if (originX + cropW > pw) {
    originX = Math.max(0, pw - cropW);
    cropW = Math.min(cropW, pw);
  }
  if (originY + cropH > ph) {
    originY = Math.max(0, ph - cropH);
    cropH = Math.min(cropH, ph);
  }

  const result = await manipulateAsync(
    currentUri,
    [
      {
        crop: {
          originX,
          originY,
          width: cropW,
          height: cropH,
        },
      },
    ],
    { compress: 1.0, format: SaveFormat.JPEG }
  );

  return result.uri;
}

export function AccountVerificationIdFrontScreen() {
  const router = useRouter();
  const cameraRef = React.useRef<CameraView>(null);
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [isTorchOn, setIsTorchOn] = React.useState(false);
  const [capturedImageUri, setCapturedImageUri] = React.useState<string | null>(null);

  const [cameraLayout, setCameraLayout] = React.useState<ViewportLayout>({
    width: 0,
    height: 0,
  });

  const frameWidth = Math.min(width - 40, 360);
  const frameHeight = Math.round(frameWidth / ID_CARD_ASPECT_RATIO);

  // Tính toán vị trí khung ngắm cân đối hoàn hảo trong viewport
  const getFrameLayout = (): FrameCoordinates => {
    const cw = cameraLayout.width || width;
    const ch = cameraLayout.height || height - 56;
    const middleH = Math.max(frameHeight, ch - TOP_TIPS_HEIGHT - BOTTOM_BAR_HEIGHT);
    const frameX = Math.max(0, (cw - frameWidth) / 2);
    const frameY = TOP_TIPS_HEIGHT + (middleH - frameHeight) / 2;
    return {
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
    };
  };

  const handleCapture = async () => {
    if (!cameraReady || !cameraRef.current || isCapturing) {
      return;
    }

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        skipProcessing: false,
      });

      if (photo?.uri) {
        let finalUri = photo.uri;
        if (photo.width && photo.height) {
          try {
            const currentFrameLayout = getFrameLayout();
            const currentCameraLayout = {
              width: cameraLayout.width || width,
              height: cameraLayout.height || height - 56,
            };

            finalUri = await cropToIdFrame(
              {
                uri: photo.uri,
                width: photo.width,
                height: photo.height,
              },
              currentCameraLayout,
              currentFrameLayout
            );
          } catch {
            finalUri = photo.uri;
          }
        }
        setCapturedImageUri(finalUri);
      }
    } catch {
      Alert.alert('Không thể chụp ảnh', 'Vui lòng thử lại và giữ CCCD trọn trong khung.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted && !result.canAskAgain) {
      Alert.alert(
        'Cần quyền camera',
        'Hãy bật quyền camera cho HANDY GO trong phần Cài đặt của điện thoại.'
      );
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
        {/* Header Bar */}
        <View className="relative z-20 h-14 flex-row items-center justify-between border-b border-white/10 bg-neutral-950 px-4">
          <Pressable
            testID="kyc-id-front-back"
            accessibilityRole="button"
            accessibilityLabel="Quay lại hướng dẫn"
            onPress={() => router.back()}
            className="size-10 items-center justify-center rounded-full active:bg-white/10"
          >
            <ArrowLeft width={10} height={20} color="#FFFFFF" />
          </Pressable>

          <View className="items-center">
            <Text className="text-base font-semibold text-white">Chụp CCCD</Text>
            <Text className="mt-0.5 text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
              Mặt trước · Bước 1/2
            </Text>
          </View>

          {/* Nút bật/tắt Đèn Flash / Trợ sáng */}
          {!capturedImageUri && permission?.granted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isTorchOn ? 'Tắt đèn trợ sáng' : 'Bật đèn trợ sáng'}
              onPress={() => setIsTorchOn((prev) => !prev)}
              className={`size-10 items-center justify-center rounded-full border transition-colors ${
                isTorchOn
                  ? 'border-amber-400/80 bg-amber-400/20 active:bg-amber-400/30'
                  : 'border-white/15 bg-white/5 active:bg-white/10'
              }`}
            >
              {isTorchOn ? <FlashIcon color="#FBBF24" size={20} /> : <FlashOffIcon color="#9CA3AF" size={20} />}
            </Pressable>
          ) : (
            <View className="size-10" />
          )}
        </View>

        {capturedImageUri ? (
          /* Màn hình xem lại ảnh đã chụp: vừa vặn và cân đối hoàn hảo */
          <View className="flex-1 justify-between px-5 pt-5 pb-4">
            <View className="flex-row items-center gap-3">
              <View className="size-11 items-center justify-center rounded-full bg-emerald-400/15">
                <CheckCircleIcon color="#34D399" size={24} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white">Ảnh CCCD mặt trước</Text>
                <Text className="mt-0.5 text-xs/4 text-neutral-300">
                  Kiểm tra thông tin họ tên, số thẻ và mã QR rõ ràng
                </Text>
              </View>
            </View>

            <View
              testID="kyc-id-front-preview-frame"
              className="w-full overflow-hidden rounded-2xl border border-white/20 bg-black shadow-2xl"
              style={{ aspectRatio: ID_CARD_ASPECT_RATIO }}
            >
              <Image
                testID="kyc-id-front-preview"
                source={{ uri: capturedImageUri }}
                contentFit="cover"
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
        ) : permission?.granted ? (
          /* Màn hình Camera Full Screen kèm Khung ngắm cân đối */
          <View
            className="relative flex-1 overflow-hidden"
            onLayout={(e) => {
              const { width: w, height: h } = e.nativeEvent.layout;
              setCameraLayout({ width: w, height: h });
            }}
          >
            {/* Native Camera View */}
            <CameraView
              ref={cameraRef}
              testID="kyc-id-front-camera"
              facing="back"
              mode="picture"
              enableTorch={isTorchOn}
              onCameraReady={() => setCameraReady(true)}
              onMountError={() => Alert.alert('Không thể mở camera', 'Hãy thử lại sau.')}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Khung ngắm và bảng điều khiển cân đối */}
            <View className="flex-1">
              {/* Header tips bar: cố định chiều cao 56px */}
              <View
                style={{ height: TOP_TIPS_HEIGHT }}
                className="items-center justify-center px-6"
              >
                <Text className="text-center text-xs font-medium text-white/90">
                  Đặt thẻ nằm ngang, đủ ánh sáng, tránh chói lóa
                </Text>
              </View>

              {/* Vùng giữa chứa Khung căn chỉnh: Căn giữa chính xác tuyệt đối */}
              <View className="flex-1 items-center justify-center" pointerEvents="none">
                <View
                  testID="kyc-id-front-frame"
                  accessibilityLabel="Khung căn chỉnh CCCD tỷ lệ 1.586 trên 1"
                  className="relative overflow-hidden rounded-2xl border-2 border-white/80 bg-transparent shadow-2xl"
                  style={{ width: frameWidth, height: frameHeight }}
                >
                  {/* 4 Góc bo phản quang nổi bật */}
                  <View className="absolute top-2 left-2 size-6 rounded-tl-lg border-t-[3.5px] border-l-[3.5px] border-sky-400" />
                  <View className="absolute top-2 right-2 size-6 rounded-tr-lg border-t-[3.5px] border-r-[3.5px] border-sky-400" />
                  <View className="absolute bottom-2 left-2 size-6 rounded-bl-lg border-b-[3.5px] border-l-[3.5px] border-sky-400" />
                  <View className="absolute right-2 bottom-2 size-6 rounded-br-lg border-r-[3.5px] border-b-[3.5px] border-sky-400" />

                  {/* Vạch kẻ chỉ dẫn mờ ở giữa */}
                  <View className="absolute inset-x-8 top-1/2 h-[1px] bg-white/20" />
                </View>

                <Text className="mt-3 text-center text-[11px] font-medium text-sky-200">
                  Giữ thẻ nằm trọn bên trong khung màu xanh
                </Text>
              </View>

              {/* Bottom Action Bar: cố định chiều cao 140px */}
              <View
                style={{ height: BOTTOM_BAR_HEIGHT }}
                className="items-center justify-center border-t border-white/10 bg-black/60 px-5 pt-2 pb-4 backdrop-blur-md"
              >
                <Pressable
                  testID="kyc-id-front-capture"
                  accessibilityRole="button"
                  accessibilityLabel="Chụp CCCD mặt trước"
                  disabled={!cameraReady || isCapturing}
                  onPress={() => void handleCapture()}
                  className={`size-[76px] items-center justify-center rounded-full border-[3px] border-white bg-white/20 active:scale-95 ${
                    !cameraReady || isCapturing ? 'opacity-50' : 'opacity-100'
                  }`}
                >
                  <View className="size-[60px] items-center justify-center rounded-full bg-white shadow-lg">
                    {isCapturing ? <ActivityIndicator color="#0284C7" size="small" /> : null}
                  </View>
                </Pressable>
                <Text className="mt-2 text-xs text-white/80">
                  {isCapturing ? 'Đang căn nét và lưu ảnh...' : 'Nhấn nút để chụp thẻ'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
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
                ? 'Cho phép camera để chụp trực tiếp CCCD mặt trước với chất lượng cao.'
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
