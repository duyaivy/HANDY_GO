import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { ShieldCheckIcon, UserIcon } from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

function Requirement({ children }: { children: string }) {
  return (
    <View className="mt-1 flex-row items-start gap-2">
      <View className="mt-1.5 size-1.5 rounded-full bg-blue-600" />
      <Text className="flex-1 text-xs/4 text-neutral-600 dark:text-neutral-300">{children}</Text>
    </View>
  );
}

function StepHeading({ number, title }: { number: string; title: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="size-7 items-center justify-center rounded-full bg-blue-700">
        <Text className="text-xs font-bold text-white">{number}</Text>
      </View>
      <Text className="flex-1 text-sm font-bold text-neutral-900 dark:text-white">{title}</Text>
    </View>
  );
}

function IdentityCardExample({ compact }: { compact: boolean }) {
  return (
    <View testID="kyc-id-card-illustration" className={`relative mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 ${compact ? 'h-[124px]' : 'h-[204px]'}`}>
      <Image
        source={require('../../../../../assets/kyc/identity-card-example.jpg')}
        contentFit="contain"
        className="size-full"
      />
    </View>
  );
}

function PortraitSample({ gender, compact }: { gender: 'Nam' | 'Nữ'; compact: boolean }) {
  const isMale = gender === 'Nam';

  return (
    <View testID={`kyc-portrait-${gender.toLowerCase()}`} className={`relative overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 ${compact ? 'h-[132px] w-[100px]' : 'h-[172px] w-[128px]'}`}>
      <Image
        source={require('../../../../../assets/kyc/portrait-pair.jpg')}
        contentFit="fill"
        style={{
          position: 'absolute',
          width: '200%',
          height: '100%',
          left: isMale ? undefined : 0,
          right: isMale ? 0 : undefined,
        }}
      />
    </View>
  );
}

export function AccountVerificationIntroScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const compact = height < 720;

  const handleContinue = () => router.push(RouteNames.ACCOUNT_VERIFICATION_ID_FRONT as any);

  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <View className="flex-1">
        <View className="relative h-12 flex-row items-center justify-center border-b border-neutral-200 dark:border-neutral-800">
          <Pressable
            testID="kyc-intro-back"
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => router.back()}
            className="absolute top-1 left-4 size-10 items-center justify-center rounded-full active:bg-neutral-200 dark:active:bg-neutral-800"
          >
            <ArrowLeft width={10} height={20} color="#374151" />
          </Pressable>
          <Text className="text-base font-bold text-neutral-900 dark:text-white">Hướng dẫn</Text>
        </View>

        <View className={`flex-1 px-5 ${compact ? 'py-2' : 'py-3'}`}>
          <View>
            <Text className="text-[20px] font-bold text-neutral-900 dark:text-white">Xác minh tài khoản</Text>
            <View className="mt-2 flex-row gap-2.5">
              <View className="flex-1 flex-row items-center gap-2 rounded-lg border border-blue-100 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
                <ShieldCheckIcon color="#2563EB" size={17} />
                <Text className="flex-1 text-xs font-semibold text-neutral-800 dark:text-neutral-100">Giấy tờ tùy thân</Text>
              </View>
              <View className="flex-1 flex-row items-center gap-2 rounded-lg border border-blue-100 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
                <UserIcon color="#2563EB" size={17} />
                <Text className="flex-1 text-xs font-semibold text-neutral-800 dark:text-neutral-100">Khuôn mặt</Text>
              </View>
            </View>
          </View>

          <View className={compact ? 'mt-3' : 'mt-4'}>
            <StepHeading number="1" title="Chụp giấy tờ tùy thân" />
            <Requirement>Giấy tờ còn hạn, ảnh gốc; không scan hoặc photocopy.</Requirement>
            <Requirement>Ảnh rõ nét, không bị mờ.</Requirement>
            <IdentityCardExample compact={compact} />
          </View>

          <View className={compact ? 'mt-3' : 'mt-4'}>
            <StepHeading number="2" title="Chụp ảnh bản thân" />
            <Requirement>Chụp trực tiếp, trang phục phù hợp.</Requirement>
            <Requirement>Ảnh rõ nét, không bị mờ.</Requirement>
            <View className="mt-2 flex-row justify-center gap-2.5">
              <PortraitSample gender="Nữ" compact={compact} />
              <PortraitSample gender="Nam" compact={compact} />
            </View>
          </View>
        </View>

        <View className="border-t border-neutral-200 bg-white px-5 py-2.5 dark:border-neutral-800 dark:bg-neutral-950">
          <Button
            testID="kyc-intro-continue"
            label="Tiếp tục"
            size="lg"
            className="h-11 rounded-xl bg-blue-700 active:bg-blue-800 dark:bg-blue-600"
            onPress={handleContinue}
          />
        </View>
      </View>
    </Screen>
  );
}
