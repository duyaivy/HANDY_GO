import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export type WorkerDetailScreenProps = {
  workerId?: string;
  title?: string;
  workerName?: string;
  onBack?: () => void;
};

export function WorkerDetailScreen({
  workerId: propWorkerId,
  title: propTitle,
  workerName: propWorkerName,
  onBack,
}: WorkerDetailScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const workerId = propWorkerId || searchParams?.id || 'th-01';

  const isCanhVan = workerId === 'a-canh-van' || workerId === 'canh-van';
  const workerName = propWorkerName || (isCanhVan ? 'A CẢNH VĂN' : undefined);
  const pageTitle = propTitle || (isCanhVan ? 'Hồ sơ thợ / Worker profile (A CẢNH VĂN)' : 'Hồ sơ thợ');
  const pageSubtitle = isCanhVan ? 'Worker profile' : `Mã thợ: #${workerId}`;

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={handleBack}
        testID="worker-detail-app-bar"
      />

      <View testID="customer-worker-detail-screen" className="flex-1 p-4">
        {workerName && (
          <View
            testID="worker-profile-card"
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">
              Đối tác thợ
            </Text>
            <Text
              testID="worker-profile-name"
              className="mt-0.5 text-base font-bold text-neutral-900 dark:text-white"
            >
              {workerName}
            </Text>
            <Text className="mt-1 text-2xs text-neutral-400">
              Mã thợ: #{workerId}
            </Text>
          </View>
        )}

        {/* Skeleton notice */}
        <View className="mt-8 items-center justify-center py-6">
          <Text
            testID="customer-worker-detail-placeholder"
            className="text-center text-sm font-medium text-neutral-400 dark:text-neutral-500"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
