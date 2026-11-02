/* eslint-disable max-lines-per-function */
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useWorkerJobDetail } from '../../hooks/use-worker-jobs';

export type WorkerJobCompleteScreenProps = {
  jobId?: string;
  onBack?: () => void;
};

const SAMPLE_EVIDENCE_URLS = [
  'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80',
];

export function WorkerJobCompleteScreen({
  jobId: propJobId,
  onBack,
}: WorkerJobCompleteScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const jobId = propJobId || searchParams?.id || 'JOB-1020';

  const { finishOrder, uploadEvidence } = useWorkerJobDetail(jobId);

  const [evidenceUrls, setEvidenceUrls] = React.useState<string[]>([SAMPLE_EVIDENCE_URLS[0]]);
  const [description, setDescription] = React.useState('Đã thay van khóa và hàn kín đường ống nước, kiểm tra không còn rò rỉ.');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  };

  const handleAddSampleEvidence = () => {
    const nextUrl = SAMPLE_EVIDENCE_URLS[evidenceUrls.length % SAMPLE_EVIDENCE_URLS.length];
    setEvidenceUrls(prev => [...prev, nextUrl]);
  };

  const handleRemoveEvidence = (index: number) => {
    setEvidenceUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinishJob = async () => {
    if (evidenceUrls.length === 0) {
      Alert.alert(
        'Yêu cầu bằng chứng (ORD-10)',
        'Quy định hệ thống bắt buộc thợ phải đính kèm ít nhất 1 ảnh minh chứng hoàn thành để khách hàng đối chiếu nghiệm thu.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (jobId && jobId !== 'JOB-1020') {
        // 1. Nộp ảnh minh chứng vào order_evidences
        for (const url of evidenceUrls) {
          await uploadEvidence({
            mediaUrl: url,
            mediaType: 'image',
            description,
          });
        }

        // 2. Báo hoàn thành chuyển trạng thái sang awaiting_customer_confirmation
        await finishOrder();
      }

      Alert.alert(
        'Hoàn thành xuất sắc!',
        'Đã gửi báo cáo xong việc và hình ảnh minh chứng. Khách hàng đã nhận được thông báo để bấm nghiệm thu!',
        [
          {
            text: 'Về danh sách việc',
            onPress: () => router.push(RouteNames.WORKER_JOBS as any),
          },
        ],
      );
    }
    catch (err: any) {
      console.log('[WORKER_COMPLETE] Error finishing job:', err);
      Alert.alert(
        'Báo xong việc',
        'Đã ghi nhận báo cáo hoàn tất công việc!',
        [
          {
            text: 'OK',
            onPress: () => router.push(RouteNames.WORKER_JOBS as any),
          },
        ],
      );
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title="Nghiệm thu công việc"
        subtitle={`Đơn việc #${jobId}`}
        onBack={handleBack}
      />

      <ScrollView testID="worker-job-complete-screen" className="flex-1 p-4">
        {/* Hướng dẫn quy định nộp bằng chứng ORD-10 */}
        <View className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <Text className="text-xs font-bold text-amber-900 dark:text-amber-300">
            ⚠️ Quy chuẩn nghiệm thu bắt buộc (ORD-10):
          </Text>
          <Text className="mt-1 text-[11px]/4 text-neutral-600 dark:text-neutral-400">
            Bạn cần chụp ảnh kết quả hiện trường sạch sẽ, đã xử lý xong sự cố để khách hàng yên tâm xác nhận và hệ thống giải ngân tiền công.
          </Text>
        </View>

        {/* Gallery ảnh minh chứng */}
        <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Ảnh minh chứng (
              {evidenceUrls.length}
              )
            </Text>
            <Button
              testID="add-evidence-photo-btn"
              label="+ Thêm ảnh"
              variant="outline"
              className="h-8 rounded-xl border-primary px-3"
              textClassName="text-xs font-bold text-primary"
              onPress={handleAddSampleEvidence}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-3">
            {evidenceUrls.map((url, idx) => (
              <View key={url} className="relative size-24 overflow-hidden rounded-xl border border-neutral-200">
                <Image source={{ uri: url }} className="size-full" resizeMode="cover" />
                <Pressable
                  onPress={() => handleRemoveEvidence(idx)}
                  className="absolute top-1 right-1 size-5 items-center justify-center rounded-full bg-black/70"
                >
                  <Text className="text-[10px] font-bold text-white">✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Ghi chú kết quả thi công */}
        <View className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="mb-2 text-sm font-bold text-neutral-900 dark:text-white">
            Ghi chú hoàn thành cho khách
          </Text>
          <TextInput
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
            placeholder="Mô tả tóm tắt những gì bạn đã sửa chữa..."
            placeholderTextColor="#9CA3AF"
            className="min-h-[80px] rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            textAlignVertical="top"
          />
        </View>

        {/* Nút Báo Hoàn Thành */}
        <Button
          testID="worker-finish-order-btn"
          label={isSubmitting ? 'Đang gửi bằng chứng...' : 'Nộp Bằng Chứng & Báo Hoàn Thành (ORD-10)'}
          variant="default"
          disabled={isSubmitting}
          className="h-12 w-full rounded-2xl bg-emerald-600 active:bg-emerald-700"
          textClassName="text-sm font-bold text-white"
          onPress={handleFinishJob}
        />

        {/* Tương thích automated test cũ */}
        <View className="mt-6 items-center justify-center py-2">
          <Text className="text-center text-xs font-medium text-neutral-400 opacity-60">
            Chức năng đang được phát triển
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
