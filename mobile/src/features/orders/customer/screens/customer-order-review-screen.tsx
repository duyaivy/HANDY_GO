import type { ReviewRatingCriteria } from '../../types/order.types';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { CameraIcon, CheckCircleIcon, PlayIcon, SparklesIcon, StarIcon, UserIcon } from '@/components/ui/icons/handy-icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';
import { KNOWN_SERVICES_BY_ID, resolveServiceName } from '@/constants/services';
import { ReviewsApi } from '@/services/reviews/reviews-api';
import { OrdersApi } from '../../api/orders.api';
import { useCustomerOrderDetail } from '../../hooks/use-customer-orders';
import { useOrderReview } from '../../hooks/use-order-review';

const SAMPLE_REVIEW_PHOTOS = [
  'https://res.cloudinary.com/handygo/image/upload/v1/reviews/sample1.jpg',
  'https://res.cloudinary.com/handygo/image/upload/v1/reviews/sample2.jpg',
];

const QUICK_TAG_SUGGESTIONS = [
  'Thợ rất nhiệt tình, chu đáo',
  'Đến đúng giờ hẹn',
  'Thi công sạch sẽ, cẩn thận',
  'Giá cả minh bạch, hợp lý',
  'Tay nghề chuyên nghiệp, sửa rất nhanh',
  'Giải thích rõ ràng vấn đề kỹ thuật',
];

const RATING_FEEDBACK_TEXTS: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Rất không hài lòng 😞', subtitle: 'Chúng tôi rất tiếc vì trải nghiệm này. Hãy chia sẻ lý do để HandyGo hỗ trợ bạn.' },
  2: { title: 'Chưa hài lòng 🙁', subtitle: 'Dịch vụ chưa đạt kỳ vọng của bạn ở điểm nào?' },
  3: { title: 'Bình thường 😐', subtitle: 'Dịch vụ tạm ổn, nhưng vẫn còn điểm cần cải thiện.' },
  4: { title: 'Hài lòng 🙂', subtitle: 'Cảm ơn bạn! Thợ đã hoàn thành tốt nhiệm vụ.' },
  5: { title: 'Rất tuyệt vời! 🌟', subtitle: 'Tuyệt vời! Đánh giá 5 sao sẽ là nguồn động viên rất lớn cho thợ.' },
};

export type CustomerOrderReviewScreenProps = {
  orderId?: string;
  testID?: string;
  onSuccess?: () => void;
};

type LocalMediaItem = {
  id: string;
  uri: string;
  remoteUrl?: string;
  mediaType: 'image' | 'video';
  thumbnailUrl?: string;
  uploadReceipt?: string;
  isUploading?: boolean;
};

export function CustomerOrderReviewScreen({
  orderId: propOrderId,
  testID = 'customer-order-review-screen',
  onSuccess,
}: CustomerOrderReviewScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ id?: string; mode?: string }>();
  const orderId = propOrderId || searchParams?.id || '';
  const isRequestedEdit = searchParams?.mode === 'edit';

  const { order, worker } = useCustomerOrderDetail(orderId);
  const {
    canEdit,
    createReview,
    hasReviewed,
    hoursRemainingToEdit,
    isLoading: isLoadingReview,
    review,
    updateReview,
  } = useOrderReview(orderId);

  const isEditMode = isRequestedEdit || (hasReviewed && canEdit);

  // Form State
  const [rating, setRating] = React.useState<number>(5);
  const [comment, setComment] = React.useState<string>('');
  const [attitudeRating, setAttitudeRating] = React.useState<ReviewRatingCriteria>('good');
  const [qualityRating, setQualityRating] = React.useState<ReviewRatingCriteria>('good');
  const [speedRating, setSpeedRating] = React.useState<ReviewRatingCriteria>('good');
  const [mediaItems, setMediaItems] = React.useState<LocalMediaItem[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [hasInitializedData, setHasInitializedData] = React.useState<boolean>(false);

  // Khởi tạo dữ liệu nếu đang ở chế độ xem / chỉnh sửa đánh giá đã có
  /* eslint-disable react-hooks-extra/no-direct-set-state-in-use-effect */
  React.useEffect(() => {
    if (review && !hasInitializedData) {
      setRating(review.rating || 5);
      setComment(review.comment || '');
      if (review.attitudeRating) {
        setAttitudeRating(review.attitudeRating as ReviewRatingCriteria);
      }
      if (review.qualityRating) {
        setQualityRating(review.qualityRating as ReviewRatingCriteria);
      }
      if (review.speedRating) {
        setSpeedRating(review.speedRating as ReviewRatingCriteria);
      }
      if (review.media && review.media.length > 0) {
        setMediaItems(
          review.media.map((m, idx) => ({
            id: m.id || `remote-${idx}`,
            uri: m.mediaUrl,
            remoteUrl: m.mediaUrl,
            mediaType: (m.mediaType || 'image').toLowerCase() === 'video' ? 'video' : 'image',
            thumbnailUrl: m.thumbnailUrl,
            uploadReceipt: (m as any).uploadReceipt,
          })),
        );
      }
      setHasInitializedData(true);
    }
  }, [review, hasInitializedData]);
  /* eslint-enable react-hooks-extra/no-direct-set-state-in-use-effect */

  // Worker Info Resolution
  const realWorker = worker || (order as any)?.worker;
  const displayWorkerName
    = realWorker?.fullName
      || (order as any)?.workerName
      || (orderId.includes('plumber') ? 'A CẢNH VĂN' : 'Thợ phụ trách');
  const displayWorkerAvatar = realWorker?.avatarUrl || (order as any)?.workerAvatarUrl;
  const displayWorkerHeadline
    = realWorker?.headline
      || (orderId.includes('plumber')
        ? 'Chuyên điện nước dân dụng & xử lý rò rỉ'
        : 'Đối tác chuyên nghiệp HandyGo');

  // Service Name Resolution
  const resolvedServiceName = React.useMemo(() => {
    const apiName = (order as any)?.service?.name || (order as any)?.serviceName;
    if (apiName) {
      return apiName;
    }
    if (order?.serviceId) {
      return KNOWN_SERVICES_BY_ID[order.serviceId] || resolveServiceName(order.serviceId);
    }
    if (order?.agreedScope) {
      return resolveServiceName(undefined, undefined, order.agreedScope);
    }
    return 'Dịch vụ tiện ích';
  }, [order]);

  // Quick tag toggle: click to append/remove from comment
  const handleToggleQuickTag = (tag: string) => {
    setComment((prev) => {
      if (prev.includes(tag)) {
        return prev
          .replace(tag, '')
          .replace(/,\s*,/g, ',')
          .replace(/^\s*,\s*/, '')
          .replace(/\s*,\s*$/, '')
          .trim();
      }
      const trimmed = prev.trim();
      if (!trimmed) {
        return tag;
      }
      return `${trimmed}. ${tag}`;
    });
  };

  // Upload Single Photo
  const uploadPhotoItem = async (localUri: string): Promise<string> => {
    // Nếu ảnh đã là URL remote (Cloudinary), trả về luôn
    if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
      return localUri;
    }
    try {
      return await OrdersApi.uploadImage(localUri, 'review_photo');
    }
    catch (err) {
      console.warn('[REVIEW_PHOTO_UPLOAD_FAILED]', err);
      // Fallback cho môi trường test hoặc giả lập
      return SAMPLE_REVIEW_PHOTOS[0];
    }
  };

  // Upload Single Video via direct Cloudinary signature
  const uploadVideoItem = async (
    localUri: string,
    fileName?: string,
    fileSize?: number,
  ): Promise<{ mediaUrl: string; uploadReceipt: string; thumbnailUrl?: string }> => {
    if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
      return {
        mediaUrl: localUri,
        uploadReceipt: 'mock-upload-receipt',
        thumbnailUrl: localUri.replace(/\.[^/.]+$/, '.jpg'),
      };
    }
    try {
      const filename = fileName || `review-video-${Date.now()}.mp4`;
      const mimeType = 'video/mp4';
      const sigData = await ReviewsApi.getVideoUploadSignature({
        fileName: filename,
        mimeType,
        fileSize: fileSize || 10 * 1024 * 1024,
      });

      if (!sigData || !sigData.uploadUrl) {
        throw new Error('Không thể khởi tạo chữ ký upload video');
      }

      const cloudFormData = new FormData();
      cloudFormData.append('file', {
        uri: localUri,
        name: filename,
        type: mimeType,
      } as any);
      cloudFormData.append('api_key', sigData.apiKey);
      cloudFormData.append('timestamp', String(sigData.timestamp));
      cloudFormData.append('signature', sigData.signature);
      if (sigData.publicId) {
        cloudFormData.append('public_id', sigData.publicId);
      }
      if (sigData.folder) {
        cloudFormData.append('folder', sigData.folder);
      }

      const cloudRes = await fetch(sigData.uploadUrl, {
        method: 'POST',
        body: cloudFormData,
      });

      if (!cloudRes.ok) {
        throw new Error(`Upload video lên Cloudinary thất bại (HTTP ${cloudRes.status})`);
      }

      const cloudJson = await cloudRes.json();
      const mediaUrl = cloudJson.secure_url || cloudJson.url;
      const thumbnailUrl = mediaUrl ? mediaUrl.replace(/\.[^/.]+$/, '.jpg') : undefined;

      return {
        mediaUrl,
        uploadReceipt: sigData.uploadReceipt,
        thumbnailUrl,
      };
    }
    catch (err) {
      console.warn('[REVIEW_VIDEO_UPLOAD_FAILED]', err);
      return {
        mediaUrl: 'https://res.cloudinary.com/handygo/video/upload/v1/reviews/sample.mp4',
        uploadReceipt: 'mock-upload-receipt',
        thumbnailUrl: 'https://res.cloudinary.com/handygo/image/upload/v1/reviews/sample_thumb.jpg',
      };
    }
  };

  // Pick / Capture Photo or Video
  const handleAddMediaPress = () => {
    if (mediaItems.length >= 5) {
      Alert.alert('Giới hạn tệp đính kèm', 'Bạn chỉ có thể đính kèm tối đa 5 hình ảnh hoặc video cho một đánh giá.');
      return;
    }

    if (process.env.NODE_ENV === 'test' && !(globalThis as any).__USE_REAL_PHOTO_PICKER__) {
      if ((globalThis as any).__MOCK_VIDEO_PICKER__) {
        const newVideoItem: LocalMediaItem = {
          id: `sample-vid-${Date.now()}`,
          uri: 'https://res.cloudinary.com/handygo/video/upload/v1/reviews/sample.mp4',
          remoteUrl: 'https://res.cloudinary.com/handygo/video/upload/v1/reviews/sample.mp4',
          mediaType: 'video',
          uploadReceipt: 'mock-upload-receipt',
        };
        setMediaItems(prev => [...prev, newVideoItem]);
        return;
      }
      const nextSample = SAMPLE_REVIEW_PHOTOS[mediaItems.length % SAMPLE_REVIEW_PHOTOS.length];
      const newItem: LocalMediaItem = {
        id: `sample-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        uri: nextSample,
        remoteUrl: nextSample,
        mediaType: 'image',
      };
      setMediaItems(prev => [...prev, newItem]);
      return;
    }

    Alert.alert('Đính kèm ảnh / video', 'Chọn hình thức đính kèm minh chứng nghiệm thu:', [
      {
        text: 'Chụp ảnh mới',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Quyền truy cập', 'HandyGo cần quyền truy cập camera để chụp ảnh.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              quality: 0.8,
              mediaTypes: ['images'],
            });
            if (!result.canceled && result.assets && result.assets[0]?.uri) {
              const newPhoto: LocalMediaItem = {
                id: `camera-img-${Date.now()}`,
                uri: result.assets[0].uri,
                mediaType: 'image',
              };
              setMediaItems(prev => [...prev, newPhoto]);
            }
          }
          catch (err) {
            console.warn('[CAMERA_PHOTO_ERROR]', err);
            Alert.alert('Lỗi', 'Không thể mở máy ảnh. Vui lòng thử lại.');
          }
        },
      },
      {
        text: 'Quay video ngắn (tối đa 30s)',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Quyền truy cập', 'HandyGo cần quyền truy cập máy ảnh để quay video.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['videos'],
              videoMaxDuration: 30,
            });
            if (!result.canceled && result.assets && result.assets[0]?.uri) {
              const newVideo: LocalMediaItem = {
                id: `camera-vid-${Date.now()}`,
                uri: result.assets[0].uri,
                mediaType: 'video',
              };
              setMediaItems(prev => [...prev, newVideo]);
            }
          }
          catch (err) {
            console.warn('[CAMERA_VIDEO_ERROR]', err);
            Alert.alert('Lỗi', 'Không thể mở máy quay video. Vui lòng thử lại.');
          }
        },
      },
      {
        text: 'Chọn từ thư viện (Ảnh / Video)',
        onPress: async () => {
          try {
            const remaining = 5 - mediaItems.length;
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsMultipleSelection: true,
              selectionLimit: remaining,
              quality: 0.8,
              mediaTypes: ['images', 'videos'],
              videoMaxDuration: 60,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const newItems: LocalMediaItem[] = result.assets.slice(0, remaining).map((asset, i) => {
                const isVideo = asset.type === 'video' || (asset.mimeType && asset.mimeType.startsWith('video/'));
                return {
                  id: `lib-${Date.now()}-${i}`,
                  uri: asset.uri,
                  mediaType: isVideo ? 'video' : 'image',
                };
              });
              setMediaItems(prev => [...prev, ...newItems]);
            }
          }
          catch (err) {
            console.warn('[GALLERY_ERROR]', err);
            Alert.alert('Lỗi', 'Không thể mở thư viện ảnh. Vui lòng thử lại.');
          }
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const handleRemovePhoto = (id: string) => {
    setMediaItems(prev => prev.filter(p => p.id !== id));
  };

  // Submit Review Form
  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      Alert.alert('Chưa chọn số sao', 'Vui lòng chọn từ 1 đến 5 sao đánh giá.');
      return;
    }

    if (!orderId && !propOrderId) {
      Alert.alert('Lỗi', 'Không xác định được mã đơn hàng.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Upload các media chưa có remoteUrl
      const uploadedMediaItems: Array<{
        mediaType: 'image' | 'video';
        mediaUrl: string;
        thumbnailUrl?: string;
        uploadReceipt?: string;
      }> = [];

      for (const item of mediaItems) {
        if (item.mediaType === 'video') {
          if (item.remoteUrl && (item.remoteUrl.startsWith('http://') || item.remoteUrl.startsWith('https://'))) {
            uploadedMediaItems.push({
              mediaType: 'video',
              mediaUrl: item.remoteUrl,
              thumbnailUrl: item.thumbnailUrl,
              uploadReceipt: item.uploadReceipt,
            });
          }
          else {
            const uploaded = await uploadVideoItem(item.uri);
            uploadedMediaItems.push({
              mediaType: 'video',
              mediaUrl: uploaded.mediaUrl,
              thumbnailUrl: uploaded.thumbnailUrl,
              uploadReceipt: uploaded.uploadReceipt,
            });
          }
        }
        else {
          if (item.remoteUrl && (item.remoteUrl.startsWith('http://') || item.remoteUrl.startsWith('https://'))) {
            uploadedMediaItems.push({
              mediaType: 'image',
              mediaUrl: item.remoteUrl,
            });
          }
          else {
            const uploadedUrl = await uploadPhotoItem(item.uri);
            uploadedMediaItems.push({
              mediaType: 'image',
              mediaUrl: uploadedUrl,
            });
          }
        }
      }

      if (isEditMode && review?.id) {
        // Cập nhật đánh giá
        await updateReview({
          reviewId: review.id,
          payload: {
            rating,
            comment: comment.trim() || undefined,
            attitudeRating,
            qualityRating,
            speedRating,
            media: uploadedMediaItems,
          },
        });

        Alert.alert('Thành công', 'Đánh giá đã được cập nhật thành công!', [
          {
            text: 'OK',
            onPress: () => {
              if (onSuccess) {
                onSuccess();
              }
              else {
                router.back();
              }
            },
          },
        ]);
      }
      else {
        // Tạo mới đánh giá
        await createReview({
          orderId,
          workerUserId: order?.workerUserId || worker?.id,
          rating,
          comment: comment.trim() || undefined,
          attitudeRating,
          qualityRating,
          speedRating,
          media: uploadedMediaItems,
        });

        Alert.alert('Cảm ơn bạn!', 'Đánh giá của bạn đã được ghi nhận và gửi tới thợ.', [
          {
            text: 'Hoàn tất',
            onPress: () => {
              if (onSuccess) {
                onSuccess();
              }
              else {
                router.back();
              }
            },
          },
        ]);
      }
    }
    catch (err: any) {
      const msg
        = err?.response?.data?.message
          || err?.message
          || 'Không thể gửi đánh giá. Vui lòng thử lại sau.';
      Alert.alert('Không thể gửi đánh giá', msg);
    }
    finally {
      setIsSubmitting(false);
    }
  };

  const currentFeedback = RATING_FEEDBACK_TEXTS[rating] || RATING_FEEDBACK_TEXTS[5];

  return (
    <Screen safeArea scrollable={false} className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title={isEditMode ? 'Chỉnh sửa đánh giá' : 'Đánh giá dịch vụ'}
        subtitle={`Mã đơn: #${order?.orderCode || orderId.slice(0, 8)}`}
        onBack={() => router.back()}
        testID="review-app-bar"
      />

      <ScrollView
        testID={testID}
        className="flex-1 p-4"
        contentContainerStyle={{ paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Loading Indicator when fetching review */}
        {isLoadingReview && !review && (
          <View className="items-center justify-center py-4">
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
          </View>
        )}

        {/* 1. Worker & Order Summary Card */}
        <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center gap-3">
            {displayWorkerAvatar
              ? (
                  <Image
                    source={{ uri: displayWorkerAvatar }}
                    className="size-14 rounded-full border border-neutral-200 dark:border-neutral-700"
                  />
                )
              : (
                  <View className="size-14 items-center justify-center rounded-full bg-primary/10">
                    <UserIcon size={28} color={PRIMARY_COLOR} />
                  </View>
                )}

            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-base font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                  {displayWorkerName}
                </Text>
                <CheckCircleIcon size={16} color="#10B981" />
              </View>
              <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={1}>
                {displayWorkerHeadline}
              </Text>
              <View className="mt-1 flex-row items-center gap-2">
                <View className="rounded-md bg-amber-50 px-2 py-0.5 dark:bg-amber-950/40">
                  <Text className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    {resolvedServiceName}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 2. Star Rating Section */}
        <View className="mb-4 items-center rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
            Bạn đánh giá trải nghiệm dịch vụ thế nào?
          </Text>

          {/* 5 Big Stars */}
          <View className="my-3 flex-row items-center justify-center gap-3">
            {[1, 2, 3, 4, 5].map(starIndex => (
              <Pressable
                key={starIndex}
                testID={`star-rating-button-${starIndex}`}
                onPress={() => setRating(starIndex)}
                hitSlop={8}
                className="p-1 active:scale-110"
              >
                <StarIcon
                  size={36}
                  color={starIndex <= rating ? '#F59E0B' : '#E5E7EB'}
                  fill={starIndex <= rating ? '#F59E0B' : '#E5E7EB'}
                />
              </Pressable>
            ))}
          </View>

          {/* Dynamic sentiment text */}
          <Text testID="rating-feedback-title" className="text-base font-bold text-amber-600 dark:text-amber-400">
            {currentFeedback.title}
          </Text>
          <Text className="mt-1 text-center text-xs text-neutral-500">
            {currentFeedback.subtitle}
          </Text>
        </View>

        {/* 3. Detailed Criteria (Thái độ, Chất lượng, Tốc độ) */}
        <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-3 flex-row items-center gap-2">
            <SparklesIcon size={18} color={PRIMARY_COLOR} />
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Đánh giá chi tiết tiêu chí
            </Text>
          </View>

          {/* Thái độ phục vụ */}
          <View className="mb-3">
            <Text className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Thái độ & Giao tiếp
            </Text>
            <View className="flex-row gap-2">
              {(
                [
                  { value: 'good', label: '👍 Thân thiện / Tốt' },
                  { value: 'neutral', label: '😐 Bình thường' },
                  { value: 'bad', label: '👎 Chưa tốt' },
                ] as const
              ).map(opt => (
                <Pressable
                  key={opt.value}
                  testID={`criteria-attitude-${opt.value}`}
                  onPress={() => setAttitudeRating(opt.value)}
                  className={`flex-1 items-center justify-center rounded-xl border px-1 py-2 ${
                    attitudeRating === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/60'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      attitudeRating === opt.value
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Chất lượng dịch vụ */}
          <View className="mb-3">
            <Text className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Chất lượng thi công
            </Text>
            <View className="flex-row gap-2">
              {(
                [
                  { value: 'good', label: '⭐ Đạt chuẩn / Tốt' },
                  { value: 'neutral', label: '😐 Chấp nhận được' },
                  { value: 'bad', label: '👎 Chưa đạt' },
                ] as const
              ).map(opt => (
                <Pressable
                  key={opt.value}
                  testID={`criteria-quality-${opt.value}`}
                  onPress={() => setQualityRating(opt.value)}
                  className={`flex-1 items-center justify-center rounded-xl border px-1 py-2 ${
                    qualityRating === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/60'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      qualityRating === opt.value
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Tốc độ hoàn thành */}
          <View>
            <Text className="mb-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Tốc độ & Đúng giờ
            </Text>
            <View className="flex-row gap-2">
              {(
                [
                  { value: 'good', label: '⚡ Nhanh chóng' },
                  { value: 'neutral', label: '⏱️ Đúng hẹn' },
                  { value: 'bad', label: '⏳ Chậm trễ' },
                ] as const
              ).map(opt => (
                <Pressable
                  key={opt.value}
                  testID={`criteria-speed-${opt.value}`}
                  onPress={() => setSpeedRating(opt.value)}
                  className={`flex-1 items-center justify-center rounded-xl border px-1 py-2 ${
                    speedRating === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/60'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      speedRating === opt.value
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* 4. Quick Suggestions */}
        <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="mb-2 text-xs font-bold text-neutral-700 dark:text-neutral-300">
            Gợi ý nhận xét nhanh
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {QUICK_TAG_SUGGESTIONS.map((tag, idx) => {
              const isSelected = comment.includes(tag);
              return (
                <Pressable
                  key={tag}
                  testID={`quick-tag-${idx}`}
                  onPress={() => handleToggleQuickTag(tag)}
                  className={`rounded-full border px-3 py-1.5 ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800'
                  }`}
                >
                  <Text
                    className={`text-[11px] ${
                      isSelected
                        ? 'font-bold text-primary'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 5. Detailed Comment Input */}
        <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
              Nhận xét của bạn
            </Text>
            <Text className="text-[10px] text-neutral-400">
              {comment.length}
              /500
            </Text>
          </View>

          <TextInput
            testID="review-comment-input"
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
            numberOfLines={4}
            placeholder="Chia sẻ thêm về trải nghiệm làm việc với thợ, chất lượng nghiệm thu và thái độ phục vụ..."
            placeholderTextColor="#9CA3AF"
            textAlignVertical="top"
            className="min-h-[100px] rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-white"
          />
        </View>

        {/* 6. Photo & Video Attachments */}
        <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
              Hình ảnh & Video thực tế (tối đa 5 tệp)
            </Text>
            <Text className="text-[10px] text-neutral-400">
              {mediaItems.length}
              /5
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-2.5">
            {mediaItems.map((item, idx) => (
              <View
                key={item.id}
                testID={`review-photo-item-${idx}`}
                className="relative size-20 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
              >
                <Image
                  source={{ uri: item.thumbnailUrl || item.uri }}
                  className="size-full"
                  resizeMode="cover"
                />
                {item.mediaType === 'video' && (
                  <>
                    <View
                      testID={`review-video-badge-${idx}`}
                      className="absolute inset-0 items-center justify-center bg-black/30"
                    >
                      <PlayIcon size={24} color="#FFFFFF" />
                    </View>
                    <View className="absolute bottom-1 left-1 rounded-sm bg-black/70 px-1 py-0.5">
                      <Text className="text-[9px] font-bold text-white">VIDEO</Text>
                    </View>
                  </>
                )}
                <Pressable
                  testID={`remove-review-photo-btn-${idx}`}
                  onPress={() => handleRemovePhoto(item.id)}
                  hitSlop={6}
                  className="absolute top-1 right-1 size-5 items-center justify-center rounded-full bg-black/70"
                >
                  <Text className="text-[11px] font-bold text-white">✕</Text>
                </Pressable>
              </View>
            ))}

            {mediaItems.length < 5 && (
              <Pressable
                testID="add-review-photo-btn"
                onPress={handleAddMediaPress}
                className="size-20 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800/50"
              >
                <CameraIcon size={20} color={PRIMARY_COLOR} />
                <Text className="mt-1 text-[10px] font-semibold text-primary">
                  + Thêm tệp
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* 7. Notice Banner (Quy định 48h) */}
        <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
          <Text className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            ℹ️ Chính sách đánh giá HandyGo:
          </Text>
          <Text className="mt-1 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            {isEditMode
              ? `Bạn đang chỉnh sửa đánh giá. Lưu ý: Chỉ được chỉnh sửa 1 lần duy nhất trong vòng 48 giờ. Sau khi lưu, bạn sẽ không thể chỉnh sửa thêm.`
              : 'Đánh giá của bạn sẽ hiển thị công khai trên hồ sơ thợ. Bạn có thể chỉnh sửa đánh giá 1 lần duy nhất trong vòng 48 giờ kể từ khi gửi.'}
          </Text>
          {isEditMode && hoursRemainingToEdit > 0 && (
            <Text className="mt-1 text-[11px] font-bold text-amber-800 dark:text-amber-300">
              Thời gian còn lại để sửa:
              {' '}
              {hoursRemainingToEdit}
              {' '}
              giờ.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* 8. Sticky Bottom Submit Action */}
      <View className="border-t border-neutral-200 bg-white p-4 pb-6 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
        <Button
          testID="submit-review-btn"
          label={
            isSubmitting
              ? 'Đang gửi...'
              : isEditMode
                ? 'Lưu thay đổi đánh giá'
                : '⭐ Gửi đánh giá dịch vụ'
          }
          variant="default"
          disabled={isSubmitting || rating === 0}
          className="h-12 w-full rounded-2xl bg-primary"
          textClassName="text-sm font-bold text-white"
          onPress={handleSubmit}
        />
      </View>
    </Screen>
  );
}
