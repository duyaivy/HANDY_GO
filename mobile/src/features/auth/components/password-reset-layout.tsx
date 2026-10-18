import type { ReactNode } from 'react';
import * as React from 'react';
import { View } from 'react-native';
import { BrandLogo } from '@/components/brand-logo';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

type PasswordResetLayoutProps = {
  step: 1 | 2 | 3;
  title: string;
  description: string;
  children: ReactNode;
  testID: string;
};

export function PasswordResetLayout({ step, title, description, children, testID }: PasswordResetLayoutProps) {
  return (
    <Screen
      safeArea
      scrollable
      keyboardAware
      bottomOffset={70}
      className="bg-neutral-50 dark:bg-neutral-950"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      <View testID={testID} className="px-6 py-8">
        <View className="mb-6 items-center">
          <BrandLogo size={76} />
          <Text className="mt-5 text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </Text>
          <Text className="mt-2 text-center text-sm/5 text-neutral-500 dark:text-neutral-400">
            {description}
          </Text>
        </View>

        <View className="mb-5 flex-row items-center justify-center">
          {[1, 2, 3].map((item) => {
            const isCurrentOrComplete = item <= step;
            return (
              <React.Fragment key={item}>
                {item > 1
                  ? <View className={`h-1 w-10 ${item <= step ? 'bg-primary-500' : 'bg-neutral-200 dark:bg-neutral-700'}`} />
                  : null}
                <View className={`size-2.5 rounded-full ${isCurrentOrComplete ? 'bg-primary-500' : 'bg-neutral-200 dark:bg-neutral-700'}`} />
              </React.Fragment>
            );
          })}
        </View>

        <View className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {children}
        </View>
      </View>
    </Screen>
  );
}
