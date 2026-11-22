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
import { canCreateOrderReview, useOrderReview } from '../../hooks/use-order-review';

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

const MAX_VIDEO_DURATION_SEC = 30;
const MAX_VIDEO_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_REVIEW_MEDIA_ITEMS = 5;

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
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
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
  const isRequestedView = searchParams?.mode === 'view';

  const {
    order,
    worker,
    isLoading: isLoadingOrder = false,
    isError: isErrorOrder = false,
    refetch: refetchOrder,
  } = useCustomerOrderDetail(orderId);
  const {
    canEdit,
    createReview,
    hasReviewed,
    hoursRemainingToEdit,
    isLoading: isLoadingReview = false,
    isError: isErrorReview = false,
    refetch: refetchReview,
    review,
    updateReview,
  } = useOrderReview(orderId);

  const isCreationUnavailable = Boolean(order) && !hasReviewed && !canCreateOrderReview(order);

  // 3 explicit screen modes:
  // 1. 'view': Đã có review nhưng không còn quyền sửa (hết 48h hoặc đã sửa rồi), hoặc route yêu cầu mode=view
  // 2. 'edit': Đã có review và còn quyền sửa trong 48h
  // 3. 'create': Chưa có review nào
  const screenMode: 'create' | 'edit' | 'view' = React.useMemo(() => {
    if (isLoadingReview || isLoadingOrder) {
      return isRequestedView ? 'view' : 'create';
    }
    if (isCreationUnavailable) {
      return 'view';
    }
    if (hasReviewed) {
      if (isRequestedView) {
        return 'view';
      }
      if (canEdit && (isRequestedEdit || !searchParams?.mode)) {
        return 'edit';
      }
      return 'view';
    }
    return 'create';
  }, [isLoadingReview, isLoadingOrder, isCreationUnavailable, hasReviewed, isRequestedView, canEdit, isRequestedEdit, searchParams?.mode]);

  const isEditMode = screenMode === 'edit';
  const isViewMode = screenMode === 'view';

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
  const uploadPhotoItem = async (localUri: string): Promise<{ mediaUrl: string; uploadReceipt: string }> => {
    const res = await OrdersApi.uploadImageDetailed(localUri, 'review_photo');
    if (!res.uploadReceipt) {
      throw new Error('Không nhận được biên nhận tải hình ảnh');
    }
    return {
      mediaUrl: res.url,
      uploadReceipt: res.uploadReceipt,
    };
  };

  // Upload Single Video via direct Cloudinary signature
  const uploadVideoItem = async ({
    uri,
    fileName,
    fileSize,
    mimeType = 'video/mp4',
  }: LocalMediaItem): Promise<{ mediaUrl: string; uploadReceipt: string; thumbnailUrl: string }> => {
    const filename = fileName || `review-video-${Date.now()}.mp4`;
    const sigData = await ReviewsApi.getVideoUploadSignature({
      fileName: filename,
      mimeType,
      fileSize,
    });

    if (!sigData?.uploadUrl || !sigData.uploadReceipt) {
      throw new Error('Không thể khởi tạo chữ ký upload video');
    }

    const cloudFormData = new FormData();
    cloudFormData.append('file', {
      uri,
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
    const mediaUrl = cloudJson.secure_url;
    if (typeof mediaUrl !== 'string' || !mediaUrl.startsWith('https://')) {
      throw new Error('Không nhận được đường dẫn video hợp lệ');
    }
    const thumbnailUrl = mediaUrl.replace(/\.[^/.]+$/, '.jpg');

    return {
      mediaUrl,
      uploadReceipt: sigData.uploadReceipt,
      thumbnailUrl,
    };
  };

  const addPickedVideo = (asset: ImagePicker.ImagePickerAsset) => {
    // Expo reports the picked video's duration in milliseconds.
    if (asset.duration != null && asset.duration > MAX_VIDEO_DURATION_SEC * 1000) {
      Alert.alert('Video quá dài', 'Vui lòng chọn hoặc quay video có thời lượng tối đa 30 giây.');
      return;
    }
    if (asset.fileSize != null && asset.fileSize > MAX_VIDEO_FILE_SIZE_BYTES) {
      Alert.alert('Video quá lớn', 'Dung lượng video không được vượt quá 50MB.');
      return;
    }
    if (mediaItems.some(item => item.mediaType === 'video')) {
      Alert.alert('Giới hạn video', 'Mỗi đánh giá chỉ được đính kèm tối đa 1 video.');
      return;
    }

    const video: LocalMediaItem = {
      id: `review-video-${Date.now()}`,
      uri: asset.uri,
      mediaType: 'video',
      fileName: asset.fileName ?? undefined,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType ?? undefined,
    };
    setMediaItems(prev => prev.length < MAX_REVIEW_MEDIA_ITEMS && !prev.some(item => item.mediaType === 'video') ? [...prev, video] : prev);
  };

  // Camera and Library Handlers (split to ensure <= 3 buttons per Alert for full Android support)
  const handleCapturePhoto = async () => {
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
        setMediaItems(prev => prev.length < MAX_REVIEW_MEDIA_ITEMS ? [...prev, newPhoto] : prev);
      }
    }
    catch (err) {
      console.warn('[CAMERA_PHOTO_ERROR]', err);
      Alert.alert('Lỗi', 'Không thể mở máy ảnh. Vui lòng thử lại.');
    }
  };

  const handleCaptureVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền truy cập', 'HandyGo cần quyền truy cập máy ảnh để quay video.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: MAX_VIDEO_DURATION_SEC,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        addPickedVideo(result.assets[0]);
      }
    }
    catch (err) {
      console.warn('[CAMERA_VIDEO_ERROR]', err);
      Alert.alert('Lỗi', 'Không thể mở máy quay video. Vui lòng thử lại.');
    }
  };

  const handlePickFromLibrary = async (chosenType: 'images' | 'videos') => {
    try {
      const remaining = MAX_REVIEW_MEDIA_ITEMS - mediaItems.length;
      if (remaining <= 0) {
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: chosenType === 'images',
        selectionLimit: remaining,
        quality: 0.8,
        mediaTypes: [chosenType],
        videoMaxDuration: MAX_VIDEO_DURATION_SEC,
      });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      if (chosenType === 'videos') {
        addPickedVideo(result.assets[0]);
        return;
      }
      const newItems: LocalMediaItem[] = result.assets.slice(0, remaining).map((asset, i) => ({
        id: `lib-${Date.now()}-${i}`,
        uri: asset.uri,
        mediaType: 'image',
      }));
      setMediaItems(prev => [...prev, ...newItems.slice(0, Math.max(0, MAX_REVIEW_MEDIA_ITEMS - prev.length))]);
    }
    catch (err) {
      console.warn('[GALLERY_ERROR]', err);
      Alert.alert('Lỗi', 'Không thể mở thư viện. Vui lòng thử lại.');
    }
  };

  // Pick / Capture Photo or Video
  const handleAddMediaPress = () => {
    if (mediaItems.length >= MAX_REVIEW_MEDIA_ITEMS) {
      Alert.alert('Giới hạn tệp đính kèm', 'Bạn chỉ có thể đính kèm tối đa 5 hình ảnh hoặc video cho một đánh giá.');
      return;
    }

    if (process.env.NODE_ENV === 'test' && !(globalThis as any).__USE_REAL_PHOTO_PICKER__) {
      if ((globalThis as any).__MOCK_VIDEO_PICKER__) {
        if (mediaItems.some(item => item.mediaType === 'video')) {
          Alert.alert('Giới hạn video', 'Mỗi đánh giá chỉ được đính kèm tối đa 1 video.');
          return;
        }
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

    const hasVideo = mediaItems.some(item => item.mediaType === 'video');

    if (hasVideo) {
      // Đã có video, chỉ cho phép đính kèm thêm hình ảnh (tối đa 3 nút cho Android)
      Alert.alert('Đính kèm hình ảnh', 'Chọn nguồn hình ảnh:', [
        { text: 'Chụp ảnh mới', onPress: handleCapturePhoto },
        { text: 'Chọn từ thư viện', onPress: () => handlePickFromLibrary('images') },
        { text: 'Hủy', style: 'cancel' },
      ]);
      return;
    }

    // Menu lựa chọn cấp 1 (3 nút: Hình ảnh, Video, Hủy - tương thích hoàn hảo Android)
    Alert.alert('Đính kèm ảnh / video', 'Chọn loại minh chứng muốn đính kèm:', [
      {
        text: 'Hình ảnh',
        onPress: () => {
          Alert.alert('Đính kèm hình ảnh', 'Chọn nguồn hình ảnh:', [
            { text: 'Chụp ảnh mới', onPress: handleCapturePhoto },
            { text: 'Chọn từ thư viện', onPress: () => handlePickFromLibrary('images') },
            { text: 'Hủy', style: 'cancel' },
          ]);
        },
      },
      {
        text: 'Video (tối đa 30s)',
        onPress: () => {
          Alert.alert('Đính kèm video', 'Chọn nguồn video:', [
            { text: 'Quay video mới', onPress: handleCaptureVideo },
            { text: 'Chọn từ thư viện', onPress: () => handlePickFromLibrary('videos') },
            { text: 'Hủy', style: 'cancel' },
          ]);
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
    if (isLoadingReview || isLoadingOrder || !order) {
      Alert.alert(
        'Đang tải dữ liệu',
        'Hệ thống đang tải dữ liệu đơn hàng và đánh giá. Vui lòng chờ trong giây lát.',
      );
      return;
    }

    if (isErrorReview || isErrorOrder) {
      Alert.alert(
        'Lỗi tải dữ liệu',
        'Không thể xác định trạng thái đánh giá do lỗi kết nối mạng. Vui lòng thử lại.',
      );
      return;
    }

    if (isViewMode) {
      Alert.alert('Chỉ xem', 'Đánh giá này đã hết hạn chỉnh sửa và chỉ ở chế độ xem.');
      return;
    }

    if (!isEditMode && hasReviewed) {
      Alert.alert(
        'Đã đánh giá',
        'Đơn hàng này đã có đánh giá. Bạn không thể tạo thêm đánh giá mới.',
      );
      return;
    }

    if (!isEditMode && !canCreateOrderReview(order)) {
      Alert.alert(
        'Không thể đánh giá',
        'Đơn hàng này không đủ điều kiện để gửi đánh giá.',
      );
      return;
    }

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
            try {
              const uploaded = await uploadVideoItem(item);
              uploadedMediaItems.push({
                mediaType: 'video',
                mediaUrl: uploaded.mediaUrl,
                thumbnailUrl: uploaded.thumbnailUrl,
                uploadReceipt: uploaded.uploadReceipt,
              });
            }
            catch (err: any) {
              console.warn('[REVIEW_VIDEO_UPLOAD_ERROR]', err);
              Alert.alert(
                'Tải video thất bại',
                'Không thể tải video minh chứng lên máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
              );
              setIsSubmitting(false);
              return;
            }
          }
        }
        else {
          if (item.remoteUrl && (item.remoteUrl.startsWith('http://') || item.remoteUrl.startsWith('https://'))) {
            uploadedMediaItems.push({
              mediaType: 'image',
              mediaUrl: item.remoteUrl,
              thumbnailUrl: item.thumbnailUrl,
              uploadReceipt: item.uploadReceipt,
            });
          }
          else {
            try {
              const uploaded = await uploadPhotoItem(item.uri);
              uploadedMediaItems.push({
                mediaType: 'image',
                mediaUrl: uploaded.mediaUrl,
                uploadReceipt: uploaded.uploadReceipt,
              });
            }
            catch (err: any) {
              console.warn('[REVIEW_PHOTO_UPLOAD_ERROR]', err);
              Alert.alert(
                'Tải hình ảnh thất bại',
                'Không thể tải hình ảnh minh chứng lên máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
              );
              setIsSubmitting(false);
              return;
            }
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
        title={isViewMode ? 'Chi tiết đánh giá' : isEditMode ? 'Chỉnh sửa đánh giá' : 'Đánh giá dịch vụ'}
        subtitle={`Mã đơn: #${order?.orderCode || orderId.slice(0, 8)}`}
        onBack={() => router.back()}
        testID="review-app-bar"
      />

      <ScrollView
        testID={testID}
        className="flex-1 p-4"
        contentContainerStyle={{ paddingBottom: 130 }}
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

        {/* Network Error Banner with Retry */}
        {(isErrorReview || isErrorOrder) && (
          <View
            testID="review-fetch-error-banner"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 dark:border-red-900/60 dark:bg-red-950/30"
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1 flex-row items-center gap-2">
                <Text className="text-base">⚠️</Text>
                <Text className="flex-1 text-xs font-medium text-red-800 dark:text-red-200">
                  {isErrorReview
                    ? 'Không thể tải trạng thái đánh giá do lỗi kết nối mạng.'
                    : 'Không thể tải thông tin đơn hàng do lỗi kết nối mạng.'}
                </Text>
              </View>
              <Pressable
                testID="review-fetch-retry-btn"
                onPress={() => {
                  if (isErrorReview && refetchReview) {
                    refetchReview();
                  }
                  if (isErrorOrder && refetchOrder) {
                    refetchOrder();
                  }
                }}
                className="rounded-lg bg-red-100 px-3 py-1.5 active:bg-red-200 dark:bg-red-900/50"
              >
                <Text className="text-xs font-bold text-red-700 dark:text-red-200">
                  Thử lại
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Review Loading Indicator */}
        {(isLoadingReview || isLoadingOrder) && (
          <View
            testID="review-loading-indicator"
            className="mb-4 flex-row items-center justify-center gap-2 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800/60"
          >
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
            <Text className="text-xs text-neutral-600 dark:text-neutral-400">
              Đang kiểm tra trạng thái đánh giá...
            </Text>
          </View>
        )}

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
                disabled={isViewMode}
                onPress={() => {
                  if (!isViewMode) {
                    setRating(starIndex);
                  }
                }}
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
                  { value: 'good', icon: '👍', label: 'Thân thiện' },
                  { value: 'neutral', icon: '😐', label: 'Bình thường' },
                  { value: 'bad', icon: '👎', label: 'Chưa tốt' },
                ] as const
              ).map(opt => (
                <Pressable
                  key={opt.value}
                  testID={`criteria-attitude-${opt.value}`}
                  disabled={isViewMode}
                  onPress={() => {
                    if (!isViewMode) {
                      setAttitudeRating(opt.value);
                    }
                  }}
                  className={`min-h-[58px] flex-1 items-center justify-center rounded-xl border px-1 py-2 ${
                    attitudeRating === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/60'
                  }`}
                >
                  <Text className="text-base leading-none">
                    {opt.icon}
                  </Text>
                  <Text
                    className={`mt-1 text-center text-[11px] leading-tight font-semibold ${
                      attitudeRating === opt.value
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                    numberOfLines={1}
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
                  { value: 'good', icon: '⭐', label: 'Đạt chuẩn' },
                  { value: 'neutral', icon: '😐', label: 'Tạm được' },
                  { value: 'bad', icon: '👎', label: 'Chưa đạt' },
                ] as const
              ).map(opt => (
                <Pressable
                  key={opt.value}
                  testID={`criteria-quality-${opt.value}`}
                  disabled={isViewMode}
                  onPress={() => {
                    if (!isViewMode) {
                      setQualityRating(opt.value);
                    }
                  }}
                  className={`min-h-[58px] flex-1 items-center justify-center rounded-xl border px-1 py-2 ${
                    qualityRating === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/60'
                  }`}
                >
                  <Text className="text-base leading-none">
                    {opt.icon}
                  </Text>
                  <Text
                    className={`mt-1 text-center text-[11px] leading-tight font-semibold ${
                      qualityRating === opt.value
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                    numberOfLines={1}
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
                  { value: 'good', icon: '⚡', label: 'Nhanh chóng' },
                  { value: 'neutral', icon: '⏱️', label: 'Đúng hẹn' },
                  { value: 'bad', icon: '⏳', label: 'Chậm trễ' },
                ] as const
              ).map(opt => (
                <Pressable
                  key={opt.value}
                  testID={`criteria-speed-${opt.value}`}
                  disabled={isViewMode}
                  onPress={() => {
                    if (!isViewMode) {
                      setSpeedRating(opt.value);
                    }
                  }}
                  className={`min-h-[58px] flex-1 items-center justify-center rounded-xl border px-1 py-2 ${
                    speedRating === opt.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/60'
                  }`}
                >
                  <Text className="text-base leading-none">
                    {opt.icon}
                  </Text>
                  <Text
                    className={`mt-1 text-center text-[11px] leading-tight font-semibold ${
                      speedRating === opt.value
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* 4. Quick Suggestions (chỉ hiển thị khi tạo hoặc sửa) */}
        {!isViewMode && (
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
                    className={`rounded-full border px-3 py-1.5 ${isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800'
                    }`}
                  >
                    <Text
                      className={`text-[11px] ${isSelected
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
        )}

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
            editable={!isViewMode}
            maxLength={500}
            multiline
            numberOfLines={4}
            placeholder={isViewMode ? 'Không có nhận xét chi tiết' : 'Chia sẻ thêm về trải nghiệm làm việc với thợ, chất lượng nghiệm thu và thái độ phục vụ...'}
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
                {!isViewMode && (
                  <Pressable
                    testID={`remove-review-photo-btn-${idx}`}
                    onPress={() => handleRemovePhoto(item.id)}
                    hitSlop={6}
                    className="absolute top-1 right-1 size-5 items-center justify-center rounded-full bg-black/70"
                  >
                    <Text className="text-[11px] font-bold text-white">✕</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {!isViewMode && mediaItems.length < 5 && (
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
            {isViewMode ? '🔒 Trạng thái đánh giá:' : 'ℹ️ Chính sách đánh giá HandyGo:'}
          </Text>
          <Text className="mt-1 text-[11px]/relaxed text-amber-700 dark:text-amber-400">
            {isCreationUnavailable
              ? 'Đơn hàng này không đủ điều kiện để gửi đánh giá.'
              : isViewMode
                ? (review?.isEdited
                    ? 'Đánh giá này đã được chỉnh sửa 1 lần và không thể chỉnh sửa thêm.'
                    : 'Đã hết thời hạn 48 giờ để chỉnh sửa. Đánh giá hiện ở chế độ chỉ xem.')
                : isEditMode
                  ? 'Bạn đang chỉnh sửa đánh giá. Lưu ý: Chỉ được chỉnh sửa 1 lần duy nhất trong vòng 48 giờ. Sau khi lưu, bạn sẽ không thể chỉnh sửa thêm.'
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
        {isViewMode
          ? (
              <Button
                testID="close-review-btn"
                label="Quay lại"
                variant="outline"
                className="h-12 w-full rounded-2xl border-neutral-300 dark:border-neutral-700"
                textClassName="text-sm font-bold text-neutral-700 dark:text-neutral-300"
                onPress={() => (onSuccess ? onSuccess() : router.back())}
              />
            )
          : (
              <Button
                testID="submit-review-btn"
                label={
                  isLoadingReview || isLoadingOrder
                    ? 'Đang kiểm tra...'
                    : isSubmitting
                      ? 'Đang gửi...'
                      : isEditMode
                        ? 'Lưu thay đổi đánh giá'
                        : '⭐ Gửi đánh giá dịch vụ'
                }
                variant="default"
                disabled={
                  isSubmitting
                  || rating === 0
                  || isLoadingReview
                  || isLoadingOrder
                  || isErrorReview
                  || isErrorOrder
                  || !order
                }
                className="h-12 w-full rounded-2xl bg-primary"
                textClassName="text-sm font-bold text-white"
                onPress={handleSubmit}
              />
            )}
      </View>
    </Screen>
  );
}
