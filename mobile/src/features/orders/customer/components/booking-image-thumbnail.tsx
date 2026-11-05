import * as React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export type BookingImageItem = {
  id: string;
  localUri: string;
  remoteUrl?: string;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  errorMessage?: string;
  abortController?: AbortController;
};

export type BookingImageThumbnailProps = {
  item: BookingImageItem;
  index: number;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
};

const CIRCLE_RADIUS = 16;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export function BookingImageThumbnail({
  item,
  index,
  onRemove,
  onRetry,
}: BookingImageThumbnailProps) {
  const a11yLabel = React.useMemo(() => {
    const base = `Ảnh ${index + 1}`;
    switch (item.status) {
      case 'pending':
        return `${base}, đang chờ tải`;
      case 'uploading':
        return item.progress > 0
          ? `${base}, đang tải ${item.progress}%`
          : `${base}, đang tải`;
      case 'processing':
        return `${base}, đang xử lý`;
      case 'completed':
        return `${base}, đã tải xong`;
      case 'error':
        return `${base}, tải ảnh thất bại`;
      default:
        return base;
    }
  }, [index, item.status, item.progress]);

  const strokeDashoffset = CIRCLE_CIRCUMFERENCE - (Math.min(100, Math.max(0, item.progress)) / 100) * CIRCLE_CIRCUMFERENCE;

  return (
    <View
      testID={`booking-photo-thumbnail-${item.id}`}
      accessible
      accessibilityLabel={a11yLabel}
      className="relative size-20 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
    >
      {/* Background Image Preview */}
      <Image
        source={{ uri: item.remoteUrl || item.localUri }}
        className="size-full"
        resizeMode="cover"
      />

      {/* Overlay for in-flight or error states */}
      {item.status !== 'completed' && (
        <View
          testID={`thumbnail-overlay-${item.id}`}
          className="absolute inset-0 items-center justify-center bg-black/45 p-1"
        >
          {item.status === 'pending' && (
            <View className="items-center justify-center">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="mt-1 text-[9px] font-semibold text-white">Chờ tải</Text>
            </View>
          )}

          {item.status === 'uploading' && (
            <View className="items-center justify-center">
              {item.progress > 0
                ? (
                    <View className="size-10 items-center justify-center">
                      <Svg width={40} height={40} viewBox="0 0 40 40">
                        <Circle
                          cx="20"
                          cy="20"
                          r={CIRCLE_RADIUS}
                          stroke="rgba(255, 255, 255, 0.3)"
                          strokeWidth="3"
                          fill="transparent"
                        />
                        <Circle
                          cx="20"
                          cy="20"
                          r={CIRCLE_RADIUS}
                          stroke="#F5A524"
                          strokeWidth="3"
                          fill="transparent"
                          strokeDasharray={CIRCLE_CIRCUMFERENCE}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          origin="20, 20"
                          rotation="-90"
                        />
                      </Svg>
                      <Text className="absolute text-[10px] font-extrabold text-white">
                        {item.progress}
                        %
                      </Text>
                    </View>
                  )
                : (
                    <View className="items-center justify-center">
                      <ActivityIndicator size="small" color="#F5A524" />
                      <Text className="mt-1 text-[9px] font-semibold text-white">Đang tải...</Text>
                    </View>
                  )}
            </View>
          )}

          {item.status === 'processing' && (
            <View className="items-center justify-center">
              <ActivityIndicator size="small" color="#F5A524" />
              <Text className="mt-1 text-center text-[9px] font-bold text-white">
                Đang xử lý
              </Text>
            </View>
          )}

          {item.status === 'error' && (
            <View className="items-center justify-center">
              <Text className="text-[10px] font-bold text-red-400">Lỗi tải</Text>
              {onRetry && (
                <Pressable
                  testID={`retry-photo-btn-${item.id}`}
                  hitSlop={6}
                  onPress={() => onRetry(item.id)}
                  className="mt-1 rounded-full bg-white/25 px-2 py-0.5 active:bg-white/40"
                  accessibilityLabel="Thử lại tải ảnh"
                >
                  <Text className="text-[9px] font-bold text-white">Thử lại</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {/* Completed Success Checkmark Badge */}
      {item.status === 'completed' && (
        <View
          testID={`completed-badge-${item.id}`}
          className="absolute right-1 bottom-1 items-center justify-center rounded-full bg-emerald-500 p-0.5 shadow-xs"
        >
          <Svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M20 6 9 17l-5-5" />
          </Svg>
        </View>
      )}

      {/* Delete / Cancel Thumbnail Button */}
      <Pressable
        testID={`remove-photo-btn-${item.id}`}
        hitSlop={8}
        onPress={() => onRemove(item.id)}
        accessibilityLabel={`Xóa ${a11yLabel}`}
        className="absolute top-1 right-1 size-5 items-center justify-center rounded-full bg-black/70 active:bg-black"
      >
        <Text className="text-[10px] font-bold text-white">✕</Text>
      </Pressable>
    </View>
  );
}
