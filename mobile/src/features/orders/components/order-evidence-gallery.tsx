import type { OrderEvidence } from '../types/order.types';
import * as React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { CameraIcon, CloseIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';

export type OrderEvidenceGalleryProps = {
  evidences?: OrderEvidence[];
};

export function OrderEvidenceGallery({ evidences = [] }: OrderEvidenceGalleryProps) {
  const [lightboxState, setLightboxState] = React.useState<{
    items: OrderEvidence[];
    index: number;
  } | null>(null);
  const [failedImageIds, setFailedImageIds] = React.useState<Record<string, boolean>>({});

  const validEvidences = React.useMemo(() => {
    return evidences.filter(
      ev => typeof ev.mediaUrl === 'string'
        && ev.mediaUrl.trim().length > 0
        && !ev.mediaUrl.includes('undefined')
        && !failedImageIds[ev.id],
    );
  }, [evidences, failedImageIds]);

  const workEvidences = React.useMemo(
    () => validEvidences.filter(ev => ev.evidenceType !== 'dispute'),
    [validEvidences],
  );
  const disputeEvidences = React.useMemo(
    () => validEvidences.filter(ev => ev.evidenceType === 'dispute'),
    [validEvidences],
  );

  if (validEvidences.length === 0) {
    return null;
  }

  const selectedEvidence = lightboxState ? lightboxState.items[lightboxState.index] : null;

  const renderSection = (
    items: OrderEvidence[],
    options: {
      testID?: string;
      title: string;
      subtitle: string;
      accessibilityPrefix: string;
      containerClass: string;
      iconBgClass: string;
      titleClass: string;
      subtitleClass: string;
      thumbBorderClass: string;
    },
  ) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <View testID={options.testID} className={options.containerClass}>
        <View className="flex-row items-center gap-2">
          <View className={`size-7 shrink-0 items-center justify-center rounded-lg ${options.iconBgClass}`}>
            <CameraIcon size={16} color="#FFFFFF" />
          </View>
          <Text className={options.titleClass}>
            {options.title}
          </Text>
        </View>

        <Text className={options.subtitleClass}>
          {options.subtitle}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ gap: 10 }}
        >
          {items.map((ev, index) => (
            <Pressable
              key={ev.id}
              accessibilityRole="button"
              accessibilityLabel={`${options.accessibilityPrefix} ${index + 1}`}
              onPress={() => setLightboxState({ items, index })}
              className={`size-24 overflow-hidden rounded-xl border-2 bg-black/10 active:opacity-80 ${options.thumbBorderClass}`}
            >
              <Image
                source={{ uri: ev.mediaUrl }}
                className="size-full"
                resizeMode="cover"
                onError={() => {
                  setFailedImageIds(prev => ({ ...prev, [ev.id]: true }));
                }}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <>
      {renderSection(workEvidences, {
        title: 'Bằng chứng hoàn thành do Thợ nộp:',
        subtitle: 'Chạm vào từng ảnh để phóng to kiểm tra chất lượng thi công',
        accessibilityPrefix: 'Bằng chứng ảnh',
        containerClass: 'mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20',
        iconBgClass: 'bg-emerald-600',
        titleClass: 'flex-1 text-sm font-bold text-emerald-900 dark:text-emerald-300',
        subtitleClass: 'mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80',
        thumbBorderClass: 'border-emerald-300 dark:border-emerald-700',
      })}

      {renderSection(disputeEvidences, {
        testID: 'dispute-evidence-gallery',
        title: 'Bằng chứng khiếu nại:',
        subtitle: 'Ảnh đính kèm phục vụ đối soát tranh chấp',
        accessibilityPrefix: 'Bằng chứng khiếu nại',
        containerClass: 'mb-4 rounded-2xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900 dark:bg-rose-950/20',
        iconBgClass: 'bg-rose-600',
        titleClass: 'flex-1 text-sm font-bold text-rose-900 dark:text-rose-300',
        subtitleClass: 'mt-1 text-xs text-rose-700/80 dark:text-rose-400/80',
        thumbBorderClass: 'border-rose-300 dark:border-rose-700',
      })}

      {/* Fullscreen Lightbox Modal */}
      {selectedEvidence && lightboxState && (
        <Modal
          visible={Boolean(selectedEvidence)}
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxState(null)}
        >
          <View className="flex-1 items-center justify-center bg-black/95 p-4">
            {/* Modal Header */}
            <View className="absolute inset-x-4 top-12 z-10 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-white">
                Ảnh
                {' '}
                {lightboxState.index + 1}
                {' '}
                /
                {' '}
                {lightboxState.items.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng xem ảnh"
                onPress={() => setLightboxState(null)}
                className="size-10 items-center justify-center rounded-full bg-white/20 active:bg-white/40"
              >
                <CloseIcon size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Fullscreen Image */}
            <View className="h-4/5 w-full items-center justify-center">
              <Image
                source={{ uri: selectedEvidence.mediaUrl }}
                className="size-full"
                resizeMode="contain"
              />
            </View>

            {/* Modal Footer / Description */}
            {selectedEvidence.description
              ? (
                  <View className="absolute inset-x-6 bottom-12 rounded-xl bg-neutral-900/80 p-3">
                    <Text className="text-center text-xs text-white">
                      {selectedEvidence.description}
                    </Text>
                  </View>
                )
              : null}
          </View>
        </Modal>
      )}
    </>
  );
}
