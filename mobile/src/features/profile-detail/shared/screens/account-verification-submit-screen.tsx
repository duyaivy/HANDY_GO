import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { CheckCircleIcon } from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { queryClient } from '@/lib/api/query-client';
import { IdentityApi } from '@/services/identity/identity-api';
import { useAuthStore } from '@/stores/use-auth-store';

function ReviewSection({
  number,
  title,
  imageUri,
  testID,
  aspectRatio,
  roundedClass,
}: {
  number: string;
  title: string;
  imageUri?: string;
  testID: string;
  aspectRatio: number;
  roundedClass: string;
}) {
  return (
    <View className="mt-4 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="mb-3 flex-row items-center gap-3">
        <View className="size-8 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/50">
          <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">{number}</Text>
        </View>
        <Text className="flex-1 text-sm font-semibold text-neutral-900 dark:text-white">{title}</Text>
        <CheckCircleIcon color="#059669" size={20} />
      </View>
      <View className={`w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 ${roundedClass}`} style={{ aspectRatio }}>
        {imageUri
          ? <Image testID={testID} source={{ uri: imageUri }} contentFit="cover" className="size-full" />
          : (
              <View className="flex-1 items-center justify-center">
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">Chưa có ảnh</Text>
              </View>
            )}
      </View>
    </View>
  );
}

export function AccountVerificationSubmitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ idFront?: string; selfie?: string }>();
  const idFront = typeof params.idFront === 'string' ? params.idFront : undefined;
  const selfie = typeof params.selfie === 'string' ? params.selfie : undefined;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const user = useAuthStore.use.user();
  const activeMode = useAuthStore.use.activeMode();

  const handleSubmit = async () => {
    if (!idFront || !selfie) {
      Alert.alert('Thiếu ảnh xác minh', 'Vui lòng chụp lại CCCD và ảnh khuôn mặt trước khi gửi.');
      return;
    }
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('Đang gửi hồ sơ xác minh...');
    try {
      const response = await IdentityApi.verify({ idFrontUri: idFront, selfieUri: selfie });
      const jobId = response.data?.jobId;

      if (!jobId) {
        throw new Error('Hệ thống chưa tạo được mã tiến trình xác minh.');
      }

      // Cập nhật trạng thái 'under_review' (Pending) vào React Query cache ngay lập tức
      if (user?.id) {
        queryClient.setQueryData(['user-profile', user.id], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            workerProfile: {
              ...old.workerProfile,
              status: 'under_review',
            },
          };
        });
        queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] });
      }

      const targetRoute =
        activeMode === 'Customer'
          ? RouteNames.CUSTOMER_PROFILE_DETAIL
          : RouteNames.WORKER_PROFILE_DETAIL;

      // Nhảy ngay về màn hình Profile Detail không đứng ở trang gửi nữa
      router.replace(targetRoute as any);

      Alert.alert(
        'Gửi hồ sơ thành công',
        'Hồ sơ của bạn đã được gửi vào hàng đợi xử lý ngầm và chuyển sang trạng thái chờ duyệt (Pending).',
      );
    }
    catch (error) {
      Alert.alert(
        'Không thể gửi hồ sơ',
        error instanceof Error ? error.message : 'Vui lòng thử lại sau ít phút.',
      );
    }
    finally {
      setIsSubmitting(false);
      setStatusMessage(null);
    }
  };

  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <View className="flex-1">
        <View className="relative h-14 flex-row items-center justify-center border-b border-neutral-200 dark:border-neutral-800">
          <Pressable
            testID="kyc-submit-back"
            accessibilityRole="button"
            accessibilityLabel="Quay lại bước chụp ảnh"
            disabled={isSubmitting}
            onPress={() => router.back()}
            className="absolute left-4 size-10 items-center justify-center rounded-full active:bg-neutral-200 dark:active:bg-neutral-800"
          >
            <ArrowLeft width={10} height={20} color="#374151" />
          </Pressable>
          <Text className="text-base font-bold text-neutral-900 dark:text-white">Rà soát hồ sơ</Text>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-5 pt-4 pb-5" showsVerticalScrollIndicator={false}>
          <Text className="text-xl font-bold text-neutral-900 dark:text-white">Kiểm tra thông tin xác minh</Text>
          <Text className="mt-1 text-sm/5 text-neutral-500 dark:text-neutral-400">
            Hệ thống AI sẽ tự động phân tích CCCD và đối chiếu khuôn mặt trong hàng đợi ngầm.
          </Text>

          {isSubmitting && statusMessage ? (
            <View className="mt-4 flex-row items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
              <ActivityIndicator color="#1d4ed8" />
              <Text className="flex-1 text-xs font-medium text-blue-800 dark:text-blue-200">
                {statusMessage}
              </Text>
            </View>
          ) : null}

          <ReviewSection
            number="1"
            title="CCCD mặt trước"
            imageUri={idFront}
            testID="kyc-submit-id-front"
            aspectRatio={1.586}
            roundedClass="rounded-xl"
          />
          <ReviewSection
            number="2"
            title="Ảnh khuôn mặt"
            imageUri={selfie}
            testID="kyc-submit-selfie"
            aspectRatio={0.76}
            roundedClass="rounded-full mx-auto w-[65%]"
          />
        </ScrollView>

        <View className="border-t border-neutral-200 bg-white px-5 py-3 dark:border-neutral-800 dark:bg-neutral-950">
          <Button
            testID="kyc-submit-request"
            label={isSubmitting ? (statusMessage || 'Đang xử lý...') : 'Gửi yêu cầu'}
            size="lg"
            disabled={isSubmitting}
            className="h-12 rounded-xl bg-blue-700 active:bg-blue-800 dark:bg-blue-600"
            onPress={() => void handleSubmit()}
          />
        </View>
      </View>
    </Screen>
  );
}
