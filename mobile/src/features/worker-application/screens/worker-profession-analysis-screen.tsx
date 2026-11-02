import { useRouter } from 'expo-router';
import * as React from 'react';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export type WorkerProfessionAnalysisScreenProps = {
  /** Tự động quay về sau khi luồng phân tích hoàn tất (mặc định true) */
  autoReturn?: boolean;
};

export function WorkerProfessionAnalysisScreen({
  autoReturn = true,
}: WorkerProfessionAnalysisScreenProps = {}) {
  const router = useRouter();

  React.useEffect(() => {
    if (autoReturn) {
      router.back();
    }
  }, [autoReturn, router]);

  return (
    <PlaceholderScreen
      pageName="Phân tích nghề nghiệp"
      title="Phân tích nghề nghiệp"
      subtitle="Khởi tạo phỏng vấn & Đánh giá năng lực chuyên môn"
      icon="🧠"
      variant="blue"
      testID="worker-profession-analysis-screen"
    />
  );
}
