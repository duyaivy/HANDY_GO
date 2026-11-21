import type { OrderReview } from '../types/order.types';
import * as React from 'react';
import {
  Image,
  Modal,
  Pressable,
  View,
} from 'react-native';
import { Button } from '@/components/ui/button';
import { StarIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';

export type OrderReviewCardProps = {
  review: OrderReview;
  canEdit?: boolean;
  hoursRemainingToEdit?: number;
  onEditPress?: () => void;
  testID?: string;
};

const CRITERIA_LABELS: Record<string, { good: string; neutral: string; bad: string }> = {
  attitude: { good: 'Thái độ tốt', neutral: 'Thái độ bình thường', bad: 'Thái độ chưa tốt' },
  quality: { good: 'Chất lượng cao', neutral: 'Chất lượng bình thường', bad: 'Chưa đạt yêu cầu' },
  speed: { good: 'Thi công nhanh', neutral: 'Đúng tiến độ', bad: 'Chậm trễ' },
};

function getRatingDescription(rating: number): string {
  switch (rating) {
    case 5:
      return 'Rất tuyệt vời';
    case 4:
      return 'Hài lòng';
    case 3:
      return 'Bình thường';
    case 2:
      return 'Chưa hài lòng';
    case 1:
      return 'Rất không hài lòng';
    default:
      return 'Đã đánh giá';
  }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) {
    return '';
  }
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} - ${day}/${month}/${year}`;
  }
  catch {
    return '';
  }
}

export function OrderReviewCard({
  review,
  canEdit = false,
  hoursRemainingToEdit = 0,
  onEditPress,
  testID = 'order-review-card',
}: OrderReviewCardProps) {
  const [selectedPhoto, setSelectedPhoto] = React.useState<string | null>(null);

  const images = (review.media || []).filter(
    m => (m.mediaType || '').toLowerCase() === 'image',
  );

  return (
    <View
      testID={testID}
      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/20"
    >
      {/* Header: Title and Stars */}
      <View className="flex-row items-center justify-between border-b border-amber-200/60 pb-3 dark:border-amber-900/40">
        <View className="flex-row items-center gap-2">
          <View className="size-8 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/20">
            <StarIcon size={18} color="#F59E0B" fill="#F59E0B" />
          </View>
          <View>
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Đánh giá của bạn
            </Text>
            <Text className="text-[11px] text-amber-700 dark:text-amber-400">
              {getRatingDescription(review.rating)}
            </Text>
          </View>
        </View>

        {/* Star Row */}
        <View className="flex-row items-center gap-1">
          {[1, 2, 3, 4, 5].map(starIndex => (
            <StarIcon
              key={starIndex}
              size={16}
              color={starIndex <= review.rating ? '#F59E0B' : '#D1D5DB'}
              fill={starIndex <= review.rating ? '#F59E0B' : '#D1D5DB'}
            />
          ))}
          <Text className="ml-1 text-xs font-bold text-neutral-800 dark:text-neutral-200">
            {review.rating}
            .0
          </Text>
        </View>
      </View>

      {/* Criteria Badges */}
      <View className="mt-3 flex-row flex-wrap gap-1.5">
        {review.attitudeRating && (() => {
          const key = String(review.attitudeRating).toLowerCase().trim() as 'good' | 'neutral' | 'bad';
          const label = CRITERIA_LABELS.attitude[key] || review.attitudeRating;
          return (
            <View
              className={`rounded-full px-2.5 py-0.5 ${
                key === 'good'
                  ? 'bg-emerald-100 dark:bg-emerald-950/40'
                  : key === 'neutral'
                    ? 'bg-neutral-100 dark:bg-neutral-800'
                    : 'bg-rose-100 dark:bg-rose-950/40'
              }`}
            >
              <Text
                className={`text-[11px] font-medium ${
                  key === 'good'
                    ? 'text-emerald-800 dark:text-emerald-300'
                    : key === 'neutral'
                      ? 'text-neutral-700 dark:text-neutral-300'
                      : 'text-rose-800 dark:text-rose-300'
                }`}
              >
                {label}
              </Text>
            </View>
          );
        })()}

        {review.qualityRating && (() => {
          const key = String(review.qualityRating).toLowerCase().trim() as 'good' | 'neutral' | 'bad';
          const label = CRITERIA_LABELS.quality[key] || review.qualityRating;
          return (
            <View
              className={`rounded-full px-2.5 py-0.5 ${
                key === 'good'
                  ? 'bg-emerald-100 dark:bg-emerald-950/40'
                  : key === 'neutral'
                    ? 'bg-neutral-100 dark:bg-neutral-800'
                    : 'bg-rose-100 dark:bg-rose-950/40'
              }`}
            >
              <Text
                className={`text-[11px] font-medium ${
                  key === 'good'
                    ? 'text-emerald-800 dark:text-emerald-300'
                    : key === 'neutral'
                      ? 'text-neutral-700 dark:text-neutral-300'
                      : 'text-rose-800 dark:text-rose-300'
                }`}
              >
                {label}
              </Text>
            </View>
          );
        })()}

        {review.speedRating && (() => {
          const key = String(review.speedRating).toLowerCase().trim() as 'good' | 'neutral' | 'bad';
          const label = CRITERIA_LABELS.speed[key] || review.speedRating;
          return (
            <View
              className={`rounded-full px-2.5 py-0.5 ${
                key === 'good'
                  ? 'bg-emerald-100 dark:bg-emerald-950/40'
                  : key === 'neutral'
                    ? 'bg-neutral-100 dark:bg-neutral-800'
                    : 'bg-rose-100 dark:bg-rose-950/40'
              }`}
            >
              <Text
                className={`text-[11px] font-medium ${
                  key === 'good'
                    ? 'text-emerald-800 dark:text-emerald-300'
                    : key === 'neutral'
                      ? 'text-neutral-700 dark:text-neutral-300'
                      : 'text-rose-800 dark:text-rose-300'
                }`}
              >
                {label}
              </Text>
            </View>
          );
        })()}
      </View>

      {/* Review Comment */}
      {review.comment
        ? (
            <View className="mt-3 rounded-xl bg-white/80 p-3 dark:bg-neutral-900/80">
              <Text className="text-xs/relaxed text-neutral-800 dark:text-neutral-200">
                {review.comment}
              </Text>
            </View>
          )
        : null}

      {/* Photos Grid */}
      {images.length > 0 && (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {images.map((item, index) => (
            <Pressable
              key={item.id || item.mediaUrl || index}
              testID={`review-photo-${index}`}
              onPress={() => setSelectedPhoto(item.mediaUrl)}
              className="size-16 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800"
            >
              <Image
                source={{ uri: item.mediaUrl }}
                className="size-full"
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      )}

      {/* Footer Info: Timestamps & Edit Button */}
      <View className="mt-3 flex-row items-center justify-between border-t border-amber-200/40 pt-2.5 dark:border-amber-900/30">
        <View>
          <Text className="text-[10px] text-neutral-400">
            Gửi lúc:
            {' '}
            {formatDate(review.createdAt)}
          </Text>
          {review.isEdited && (
            <Text className="text-[10px] text-amber-600 dark:text-amber-400">
              (Đã chỉnh sửa lúc
              {' '}
              {formatDate(review.editedAt || review.updatedAt)}
              )
            </Text>
          )}
        </View>

        {canEdit && onEditPress && (
          <Button
            testID="edit-review-btn"
            label="Sửa đánh giá"
            variant="outline"
            className="h-7 rounded-lg border-amber-500 px-2.5"
            textClassName="text-[11px] font-bold text-amber-700 dark:text-amber-400"
            onPress={onEditPress}
          />
        )}
      </View>

      {canEdit && hoursRemainingToEdit > 0 && (
        <Text className="mt-1 text-[10px] text-neutral-400">
          * Bạn có thể chỉnh sửa đánh giá trong vòng
          {' '}
          {hoursRemainingToEdit}
          {' '}
          giờ nữa (tối đa 1 lần).
        </Text>
      )}

      {/* Lightbox Modal */}
      <Modal
        visible={Boolean(selectedPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/90 p-4"
          onPress={() => setSelectedPhoto(null)}
        >
          {selectedPhoto && (
            <Image
              source={{ uri: selectedPhoto }}
              className="h-3/4 w-full"
              resizeMode="contain"
            />
          )}
          <Text className="mt-4 text-xs font-semibold text-white">
            Nhấn ra ngoài để đóng
          </Text>
        </Pressable>
      </Modal>
    </View>
  );
}
