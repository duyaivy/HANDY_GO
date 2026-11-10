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
  const [selectedEvidenceIndex, setSelectedEvidenceIndex] = React.useState<number | null>(null);
  const [failedImageIds, setFailedImageIds] = React.useState<Record<string, boolean>>({});

  const validEvidences = React.useMemo(() => {
    return evidences.filter(
      ev => typeof ev.mediaUrl === 'string'
        && ev.mediaUrl.trim().length > 0
        && !ev.mediaUrl.includes('undefined')
        && !failedImageIds[ev.id],
    );
  }, [evidences, failedImageIds]);

  if (validEvidences.length === 0) {
    return null;
  }

  const selectedEvidence = selectedEvidenceIndex !== null ? validEvidences[selectedEvidenceIndex] : null;

  return (
    <View className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="size-7 items-center justify-center rounded-lg bg-emerald-600">
            <CameraIcon size={16} color="#FFFFFF" />
          </View>
          <Text className="text-sm font-bold text-emerald-900 dark:text-emerald-300">
            📷 Bằng chứng hoàn thành do Thợ nộp:
          </Text>
        </View>

        <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          {validEvidences.length}
          {' '}
          ảnh
        </Text>
      </View>

      <Text className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
        Chạm vào từng ảnh để phóng to kiểm tra chất lượng thi công
      </Text>

      {/* Thumbnails Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3"
        contentContainerStyle={{ gap: 10 }}
      >
        {validEvidences.map((ev, index) => (
          <Pressable
            key={ev.id}
            accessibilityRole="button"
            accessibilityLabel={`Bằng chứng ảnh ${index + 1}`}
            onPress={() => setSelectedEvidenceIndex(index)}
            className="size-24 overflow-hidden rounded-xl border-2 border-emerald-300 bg-black/10 active:opacity-80 dark:border-emerald-700"
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

      {/* Fullscreen Lightbox Modal */}
      {selectedEvidence && (
        <Modal
          visible={Boolean(selectedEvidence)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedEvidenceIndex(null)}
        >
          <View className="flex-1 items-center justify-center bg-black/95 p-4">
            {/* Modal Header */}
            <View className="absolute inset-x-4 top-12 z-10 flex-row items-center justify-between">
              <Text className="text-sm font-bold text-white">
                Ảnh
                {' '}
                {selectedEvidenceIndex! + 1}
                {' '}
                /
                {' '}
                {validEvidences.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng xem ảnh"
                onPress={() => setSelectedEvidenceIndex(null)}
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
    </View>
  );
}
