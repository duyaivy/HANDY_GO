import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';

export const ACTIVITY_FILTER_TABS = [
  'Searching',
  'In process',
  'Reorder',
  'All',
  'Finished',
  'Cancelled',
] as const;

export type ActivityFilterTab = (typeof ACTIVITY_FILTER_TABS)[number];

export type CustomerOrdersScreenProps = {
  testID?: string;
};

export function CustomerOrdersScreen({
  testID = 'orders-customer-screen',
}: CustomerOrdersScreenProps = {}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<ActivityFilterTab>('Searching');

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title="Activities"
        subtitle="Hoạt động"
        hideBackButton
        testID="activities-app-bar"
      />

      <View testID={testID} className="flex-1 p-4">
        {/* Filter tabs: Searching, In process, Reorder, All, Finished, Cancelled */}
        <View className="mb-4 shrink-0" style={{ flexGrow: 0, flexShrink: 0 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-4 px-4"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: 8, alignItems: 'center' }}
          >
            {ACTIVITY_FILTER_TABS.map((tab) => {
              const isActive = activeTab === tab;
              const tabSlug = tab.toLowerCase().replace(/\s+/g, '-');
              return (
                <Pressable
                  key={tab}
                  testID={`activity-filter-tab-${tabSlug}`}
                  onPress={() => setActiveTab(tab)}
                  style={isActive ? { borderColor: PRIMARY_COLOR, backgroundColor: '#FFFBEB' } : undefined}
                  className={`h-9 items-center justify-center self-center rounded-full border px-4 ${
                    isActive
                      ? 'border-primary dark:bg-amber-950/30'
                      : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <Text
                    style={isActive ? { color: PRIMARY_COLOR } : undefined}
                    className={`text-xs font-semibold ${
                      isActive
                        ? 'font-bold'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {tab}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Minimal order card skeleton for Plumber (#224466) */}
        <View
          testID="order-card-224466"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Plumber
            </Text>
            <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              #224466
            </Text>
          </View>

          <View className="mt-4 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <Text className="text-xs text-neutral-400">
              Chi tiết đơn dịch vụ
            </Text>
            <Button
              testID="view-quotes-btn"
              label="View 1 quotes"
              variant="default"
              className="h-9 rounded-xl bg-primary px-3.5"
              textClassName="text-xs font-bold text-white"
              onPress={() => router.push(RouteNames.CUSTOMER_ORDER_DETAIL('224466') as any)}
            />
          </View>
        </View>

        {/* Skeleton placeholder notice */}
        <View className="mt-8 items-center justify-center py-6">
          <Text
            testID={`${testID}-placeholder`}
            className="text-center text-sm font-medium text-neutral-400 dark:text-neutral-500"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
