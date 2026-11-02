import { useRouter } from 'expo-router';
import * as React from 'react';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { Button } from '@/components/ui/button';
import { RouteNames } from '@/constants/route-names';

export function WorkerSkillsScreen() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      pageName="Professional skills"
      title="Professional skills"
      subtitle="Kỹ năng chuyên môn"
      variant="blue"
      testID="worker-skills-screen"
    >
      <Button
        testID="add-professional-skills-btn"
        label="Add professional skills"
        variant="default"
        className="mt-6 w-full max-w-xs bg-blue-600 active:bg-blue-700"
        textClassName="text-white font-bold"
        onPress={() => router.push(RouteNames.WORKER_APPLICATION_ANALYSIS as any)}
      />
    </PlaceholderScreen>
  );
}
