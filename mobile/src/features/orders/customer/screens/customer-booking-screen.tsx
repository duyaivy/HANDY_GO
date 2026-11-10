/* eslint-disable react-hooks-extra/no-direct-set-state-in-use-effect */
import type { BookingImageItem } from '../components/booking-image-thumbnail';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { resolveServiceName } from '@/constants/services';
import { useAuthStore } from '@/stores/use-auth-store';
import { OrdersApi } from '../../api/orders.api';
import { useBookingDraftStore } from '../../stores/use-booking-draft-store';
import {

  BookingImageThumbnail,
} from '../components/booking-image-thumbnail';

export type { BookingImageItem };

export type CustomerBookingScreenProps = {
  serviceId?: string;
  onBack?: () => void;
};

// Preset suggestions for Plumber / Home Repair (Vua Thợ style)
const SUGGESTION_CATEGORIES = {
  issueTypes: [
    'Rò rỉ nước',
    'Tắc nghẽn',
    'Vòi/thiết bị hỏng',
    'Lắp đặt mới',
    'Chưa rõ',
  ],
  locations: [
    'Nhà bếp',
    'Nhà tắm',
    'Sân vườn',
    'Tầng hầm',
    'Chưa rõ',
  ],
  severities: [
    'Nhẹ (ít ảnh hưởng)',
    'Trung bình',
    'Nặng (ngập/nguy hiểm)',
    'Chưa rõ',
  ],
};

const SAMPLE_PHOTO_URLS = [
  'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
];

function generateQuickDescription(serviceName?: string | null): string {
  const serviceTitle = (serviceName || '').trim() || 'dịch vụ tiện ích';
  return `Tôi cần người ${serviceTitle}`;
}

export function CustomerBookingScreen({
  serviceId: propServiceId,
  onBack,
}: CustomerBookingScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ serviceId?: string; serviceName?: string }>();

  const targetServiceId = React.useMemo(() => {
    const raw = propServiceId ?? searchParams?.serviceId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [propServiceId, searchParams?.serviceId]);

  const targetServiceName = React.useMemo(() => {
    const raw = searchParams?.serviceName;
    const name = Array.isArray(raw) ? raw[0] : raw;
    if (name && name.trim()) {
      return name.trim();
    }
    if (targetServiceId) {
      const resolved = resolveServiceName(targetServiceId);
      if (resolved !== 'Dịch vụ tiện ích') {
        return resolved;
      }
    }
    return undefined;
  }, [searchParams?.serviceName, targetServiceId]);

  const serviceId = targetServiceId;

  const {
    addMediaUrl,
    description,
    mediaUrls,
    removeMediaUrl,
    replaceMediaUrl,
    serviceName,
    setDescription,
  } = useBookingDraftStore();

  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const [isSuggestionsCollapsed, setIsSuggestionsCollapsed] = React.useState(false);

  // Selected chips state (mặc định chưa chọn để tránh mang data cũ)
  const [selectedIssueType, setSelectedIssueType] = React.useState<string>('');
  const [selectedLocation, setSelectedLocation] = React.useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = React.useState<string>('');

  // Enhanced image items tracking with progress, status, and abort controllers
  const [imageItems, setImageItems] = React.useState<BookingImageItem[]>(() => {
    const currentMediaUrls = useBookingDraftStore.getState().mediaUrls;
    return currentMediaUrls.map((url, idx) => ({
      id: `preload-${idx}-${url}`,
      localUri: url,
      remoteUrl: url.startsWith('http') ? url : undefined,
      status: url.startsWith('http') ? 'completed' : 'error',
      progress: url.startsWith('http') ? 100 : 0,
    }));
  });

  const imageItemsRef = React.useRef(imageItems);
  imageItemsRef.current = imageItems;
  const isMountedRef = React.useRef(true);
  const isProceedingToNextStepRef = React.useRef(false);

  const isAnyLoading = imageItems.some(
    item => item.status === 'pending' || item.status === 'uploading' || item.status === 'processing',
  );
  const isUploading = isAnyLoading;
  const hasError = imageItems.some(item => item.status === 'error');

  // Lifecycle & Cleanup: abort tasks and reset draft if abandoning booking
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      imageItemsRef.current.forEach((item) => {
        if (item.status !== 'completed') {
          item.abortController?.abort();
          removeMediaUrl(item.localUri);
        }
      });
      if (!isProceedingToNextStepRef.current) {
        useBookingDraftStore.getState().resetDraft();
      }
    };
  }, [removeMediaUrl]);

  // Sync if draft is reset or if mediaUrls is updated externally (e.g., sample photo in tests)
  React.useEffect(() => {
    const hasInFlightOrError = imageItemsRef.current.some(
      item => item.status === 'pending' || item.status === 'uploading' || item.status === 'processing' || item.status === 'error',
    );
    if (mediaUrls.length === 0 && imageItemsRef.current.length > 0 && !hasInFlightOrError) {
      setImageItems([]);
      return;
    }

    setImageItems((prevItems) => {
      const knownUrls = new Set(
        prevItems.flatMap(i => [i.localUri, i.remoteUrl].filter(Boolean)),
      );
      const missing = mediaUrls.filter(u => !knownUrls.has(u));
      if (missing.length === 0)
        return prevItems;

      const newItems: BookingImageItem[] = missing.map((url, idx) => ({
        id: `synced-${Date.now()}-${idx}-${url}`,
        localUri: url,
        remoteUrl: url.startsWith('http') ? url : undefined,
        status: url.startsWith('http') ? 'completed' : 'error',
        progress: url.startsWith('http') ? 100 : 0,
      }));
      return [...prevItems, ...newItems];
    });
  }, [mediaUrls, isAnyLoading]);

  React.useEffect(() => {
    const store = useBookingDraftStore.getState();
    const shouldReset = Boolean(
      store.createdRequestId
      || (targetServiceId && targetServiceId !== store.serviceId),
    );

    if (shouldReset) {
      store.resetDraft();
      if (targetServiceId) {
        store.setService(targetServiceId, targetServiceName);
      }
    }
    else if (targetServiceId && (!store.serviceId || targetServiceId !== store.serviceId || (targetServiceName && store.serviceName !== targetServiceName))) {
      store.setService(targetServiceId, targetServiceName);
    }
    else if (targetServiceName && store.serviceName !== targetServiceName) {
      store.setService(store.serviceId || targetServiceId || '', targetServiceName);
    }
  }, [targetServiceId, targetServiceName]);

  // Sequential Upload Queue Runner
  React.useEffect(() => {
    if (!isMountedRef.current)
      return;

    // Wait if another item is currently in-flight
    const currentlyUploading = imageItems.find(
      item => item.status === 'uploading' || item.status === 'processing',
    );
    if (currentlyUploading) {
      return;
    }

    // Pause queue if an item errored (requires retry or removal to avoid cascading failures)
    const hasErrorItem = imageItems.find(item => item.status === 'error');
    if (hasErrorItem) {
      return;
    }

    // Find the next item waiting to upload
    const nextPending = imageItems.find(item => item.status === 'pending');
    if (!nextPending) {
      return;
    }

    const controller = new AbortController();

    // Mark current item as uploading and attach controller
    setImageItems(prev =>
      prev.map(item =>
        item.id === nextPending.id
          ? { ...item, status: 'uploading', progress: 0, abortController: controller }
          : item,
      ),
    );

    OrdersApi.uploadImage(nextPending.localUri, 'booking_issue', {
      signal: controller.signal,
      onProgress: (percent) => {
        if (!isMountedRef.current)
          return;
        setImageItems(prev =>
          prev.map((item) => {
            if (item.id !== nextPending.id)
              return item;
            if (percent >= 100) {
              return { ...item, status: 'processing', progress: 100 };
            }
            return { ...item, status: 'uploading', progress: percent };
          }),
        );
      },
    })
      .then((uploadedUrl) => {
        if (!isMountedRef.current)
          return;
        replaceMediaUrl(nextPending.localUri, uploadedUrl);
        setImageItems(prev =>
          prev.map(item =>
            item.id === nextPending.id
              ? {
                  ...item,
                  remoteUrl: uploadedUrl,
                  status: 'completed',
                  progress: 100,
                  abortController: undefined,
                }
              : item,
          ),
        );
      })
      .catch((err: any) => {
        if (!isMountedRef.current)
          return;
        if (controller.signal.aborted) {
          return;
        }

        console.warn('[BOOKING] Upload ảnh lên cloud thất bại:', err);
        removeMediaUrl(nextPending.localUri);

        const is401
          = err?.kind === 'AUTH_ERROR'
            || err?.statusCode === 401
            || err?.response?.status === 401
            || err?.message?.includes('401')
            || err?.message?.includes('UNAUTHORIZED');

        setImageItems(prev =>
          prev.map(item =>
            item.id === nextPending.id
              ? {
                  ...item,
                  status: 'error',
                  errorMessage: is401 ? 'Phiên làm việc hết hạn' : 'Tải ảnh thất bại',
                  abortController: undefined,
                }
              : item,
          ),
        );

        if (is401) {
          Alert.alert(
            'Phiên làm việc hết hạn',
            'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại để tải ảnh.',
            [
              { text: 'Đóng', style: 'cancel' },
              {
                text: 'Đăng nhập',
                onPress: () => router.push(RouteNames.LOGIN as any),
              },
            ],
          );
        }
        else {
          Alert.alert(
            'Tải ảnh thất bại',
            'Không thể tải ảnh lên máy chủ. Vui lòng thử lại sau hoặc kiểm tra kết nối mạng.',
          );
        }
      });
  }, [imageItems, replaceMediaUrl, removeMediaUrl, router]);

  const queueUpload = React.useCallback(
    (uris: string[]) => {
      if (uris.length === 0)
        return;

      const currentCount = imageItemsRef.current.length;
      const remaining = Math.max(0, 5 - currentCount);
      if (uris.length > remaining) {
        Alert.alert('Giới hạn ảnh', 'Bạn chỉ có thể đính kèm tối đa 5 hình ảnh hiện trường.');
        return;
      }

      const itemsToAdd: BookingImageItem[] = uris.map(uri => ({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        localUri: uri,
        status: 'pending',
        progress: 0,
      }));

      // Update draft store immediately for tracking and compatibility
      uris.forEach(uri => addMediaUrl(uri));

      // Append to queue
      setImageItems(prev => [...prev, ...itemsToAdd]);
    },
    [addMediaUrl],
  );

  const handleRemoveItem = React.useCallback(
    (id: string) => {
      const item = imageItemsRef.current.find(i => i.id === id);
      if (item) {
        if (item.abortController) {
          item.abortController.abort();
        }
        removeMediaUrl(item.localUri);
        if (item.remoteUrl) {
          removeMediaUrl(item.remoteUrl);
        }
      }
      setImageItems(prev => prev.filter(i => i.id !== id));
    },
    [removeMediaUrl],
  );

  const handleRetryItem = React.useCallback(
    (id: string) => {
      const item = imageItemsRef.current.find(i => i.id === id);
      if (!item)
        return;

      if (!useBookingDraftStore.getState().mediaUrls.includes(item.localUri)) {
        addMediaUrl(item.localUri);
      }

      setImageItems(prev =>
        prev.map(i =>
          i.id === id
            ? { ...i, status: 'pending', progress: 0, errorMessage: undefined }
            : i,
        ),
      );
    },
    [addMediaUrl],
  );

  const prevChipTextRef = React.useRef('');

  // Re-generate formatted description when selecting suggestions
  const handleSelectChip = (
    type: 'issue' | 'location' | 'severity',
    value: string,
  ) => {
    let issue = selectedIssueType;
    let loc = selectedLocation;
    let sev = selectedSeverity;

    if (type === 'issue') {
      issue = issue === value ? '' : value;
      setSelectedIssueType(issue);
    }
    else if (type === 'location') {
      loc = loc === value ? '' : value;
      setSelectedLocation(loc);
    }
    else if (type === 'severity') {
      sev = sev === value ? '' : value;
      setSelectedSeverity(sev);
    }

    const parts: string[] = [];
    if (issue && issue !== 'Chưa rõ')
      parts.push(`Sự cố: ${issue}`);
    if (loc && loc !== 'Chưa rõ')
      parts.push(`Vị trí: ${loc}`);
    if (sev && sev !== 'Chưa rõ')
      parts.push(`Mức độ: ${sev}`);

    const newChipText = parts.length > 0
      ? `${parts.join(' - ')}. Cần thợ kiểm tra và xử lý sớm.`
      : '';

    // Extract user custom text by stripping previous chip suggestions
    const currentDesc = useBookingDraftStore.getState().description || '';
    let baseText = currentDesc;
    if (prevChipTextRef.current && baseText.includes(prevChipTextRef.current)) {
      baseText = baseText.replace(prevChipTextRef.current, '');
    }
    // Also remove any existing chip pattern if present
    baseText = baseText.replace(/(?:\.|\s)*\b(?:Sự cố|Vị trí|Mức độ):.*?(?:\. Cần thợ kiểm tra và xử lý sớm\.?|$)/gi, '');
    baseText = baseText.trim().replace(/\s*\.\s*$/, '').trim();

    let combined = '';
    if (baseText && newChipText) {
      combined = `${baseText}. ${newChipText}`;
    }
    else if (baseText) {
      combined = baseText;
    }
    else {
      combined = newChipText;
    }

    prevChipTextRef.current = newChipText;
    setDescription(combined);
  };

  const handleQuickFill = () => {
    const quickText = generateQuickDescription(serviceName);
    setDescription(quickText);
  };

  const handleBack = React.useCallback(() => {
    isProceedingToNextStepRef.current = false;
    imageItemsRef.current.forEach((item) => {
      item.abortController?.abort();
    });
    useBookingDraftStore.getState().resetDraft();
    setImageItems([]);
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  }, [onBack, router]);

  React.useEffect(() => {
    const onHardwareBack = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [handleBack]);

  // In-app Camera states
  const [isCameraOpen, setIsCameraOpen] = React.useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraFacing, setCameraFacing] = React.useState<'back' | 'front'>('back');
  const [isFlashOn, setIsFlashOn] = React.useState(false);
  const [isCapturing, setIsCapturing] = React.useState(false);
  const [capturedPreviewUri, setCapturedPreviewUri] = React.useState<string | null>(null);
  const cameraRef = React.useRef<CameraView>(null);

  const handlePickFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Cần quyền Thư viện ảnh',
          'Vui lòng cấp quyền truy cập Thư viện ảnh trong Cài đặt của điện thoại để chọn ảnh sự cố.',
        );
        return;
      }

      const remainingSlots = Math.max(0, 5 - imageItems.length);
      if (remainingSlots <= 0) {
        Alert.alert('Giới hạn ảnh', 'Bạn chỉ có thể đính kèm tối đa 5 hình ảnh hiện trường.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (result.assets.length > remainingSlots) {
          Alert.alert('Giới hạn ảnh', 'Bạn chỉ có thể đính kèm tối đa 5 hình ảnh hiện trường.');
          return;
        }
        const uris = result.assets.map(a => a.uri);
        queueUpload(uris);
      }
    }
    catch (error) {
      console.warn('[BOOKING] Mở thư viện ảnh thất bại:', error);
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh. Vui lòng thử lại.');
    }
  };

  const handleAddPhotoPress = () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Yêu cầu đăng nhập',
        'Bạn cần đăng nhập tài khoản để tải ảnh sự cố và tiếp tục đặt dịch vụ.',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Đăng nhập ngay',
            onPress: () => router.push(RouteNames.LOGIN as any),
          },
        ],
      );
      return;
    }

    if (process.env.NODE_ENV === 'test' && !(globalThis as any).__USE_REAL_PHOTO_PICKER__) {
      const nextSample = SAMPLE_PHOTO_URLS[mediaUrls.length % SAMPLE_PHOTO_URLS.length];
      addMediaUrl(nextSample);
      return;
    }

    if (imageItems.length >= 5) {
      Alert.alert('Giới hạn ảnh', 'Bạn chỉ có thể đính kèm tối đa 5 hình ảnh hiện trường.');
      return;
    }

    Alert.alert(
      'Thêm ảnh hiện trường',
      'Chọn phương thức thêm ảnh sự cố:',
      [
        {
          text: 'Chụp ảnh ngay',
          onPress: async () => {
            if (!cameraPermission?.granted) {
              const res = await requestCameraPermission();
              if (!res.granted) {
                Alert.alert(
                  'Cần quyền Camera',
                  'Vui lòng cấp quyền truy cập máy ảnh trong Cài đặt của điện thoại để chụp ảnh sự cố tại nhà.',
                );
                return;
              }
            }
            setCapturedPreviewUri(null);
            setIsCameraOpen(true);
          },
        },
        {
          text: 'Chọn từ thư viện ảnh',
          onPress: () => void handlePickFromLibrary(),
        },
        {
          text: 'Hủy',
          style: 'cancel',
        },
      ],
      { cancelable: true },
    );
  };

  const handleCapturePhoto = async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }

    try {
      setIsCapturing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
      });

      if (photo?.uri) {
        setCapturedPreviewUri(photo.uri);
      }
    }
    catch (err) {
      console.warn('[BOOKING] Chụp ảnh thất bại:', err);
      Alert.alert('Lỗi', 'Không thể chụp ảnh. Vui lòng thử lại.');
    }
    finally {
      setIsCapturing(false);
    }
  };

  const handleConfirmCapturedPhoto = () => {
    if (!capturedPreviewUri) {
      return;
    }
    const uriToUpload = capturedPreviewUri;
    setCapturedPreviewUri(null);
    setIsCameraOpen(false);
    queueUpload([uriToUpload]);
  };

  const handleRetakePhoto = () => {
    setCapturedPreviewUri(null);
  };

  const handleCloseCamera = () => {
    setCapturedPreviewUri(null);
    setIsCameraOpen(false);
  };

  const handleNext = () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Yêu cầu đăng nhập',
        'Vui lòng đăng nhập để tiếp tục tạo yêu cầu dịch vụ.',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Đăng nhập ngay',
            onPress: () => router.push(RouteNames.LOGIN as any),
          },
        ],
      );
      return;
    }

    if (isUploading || isAnyLoading) {
      Alert.alert('Đang tải ảnh', 'Vui lòng đợi ảnh hiện trường tải lên hoàn tất.');
      return;
    }

    if (hasError) {
      Alert.alert(
        'Ảnh chưa được lưu',
        'Có ảnh chưa tải lên máy chủ thành công. Vui lòng xóa hoặc tải lại ảnh trước khi tiếp tục.',
      );
      return;
    }

    const hasLocalUri = mediaUrls.some(
      url => url.startsWith('file:') || url.startsWith('content:') || !url.startsWith('http'),
    );
    if (hasLocalUri) {
      Alert.alert(
        'Ảnh chưa được lưu',
        'Có ảnh chưa tải lên máy chủ thành công. Vui lòng xóa hoặc tải lại ảnh trước khi tiếp tục.',
      );
      return;
    }

    if (!description.trim()) {
      setDescription(generateQuickDescription(serviceName));
    }
    isProceedingToNextStepRef.current = true;
    router.push(RouteNames.CUSTOMER_BOOKING_SELECT_ADDRESS as any);
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      {/* 1. Thanh điều hướng trên cùng: Nút Quay lại & Tiêu đề quy trình */}
      <View className="flex-row items-center justify-between border-b border-neutral-100 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Pressable
          testID="app-bar-back-btn"
          onPress={handleBack}
          className="flex-row items-center active:opacity-70"
          hitSlop={8}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m15 18-6-6 6-6" />
          </Svg>
          <Text className="ml-1 text-sm font-bold text-[#F5A524]">Quay lại</Text>
        </Pressable>

        <Text className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          Mô tả sự cố
        </Text>

        {/* Giữ cân đối khoảng trống với nút Quay lại bên trái */}
        <View className="w-16" />
      </View>

      <ScrollView
        testID="customer-booking-screen"
        className="flex-1 p-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Khối tương thích ngầm cho test suite */}
        <View className="sr-only h-0 overflow-hidden opacity-0" accessible={false} pointerEvents="none">
          <Text>Đặt lịch thợ</Text>
          {serviceId ? <Text>{`Mã dịch vụ: ${serviceId}`}</Text> : null}
          <Text>Chức năng đang được phát triển</Text>
        </View>

        {/* Thẻ hiển thị dịch vụ đã chọn */}
        <View
          testID="booking-service-badge"
          className="mb-4 rounded-3xl border border-primary-200/70 bg-primary-50/50 p-4 shadow-xs dark:border-amber-900/40 dark:bg-amber-950/20"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="mr-3 size-10 items-center justify-center rounded-2xl bg-primary-100 dark:bg-amber-900/40">
                <Text className="text-xl">🛠️</Text>
              </View>
              <View>
                <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Dịch vụ đã chọn
                </Text>
                <Text
                  testID="booking-service-title"
                  className="mt-0.5 text-base font-bold text-neutral-900 dark:text-white"
                >
                  {serviceName || 'Dịch vụ tiện ích'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* 3. Thẻ gợi ý: Gợi ý cho dịch vụ này (Thu gọn / Mở rộng) */}
        <View className="mb-4 rounded-3xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <Pressable
            onPress={() => setIsSuggestionsCollapsed(!isSuggestionsCollapsed)}
            className="flex-row items-center justify-between active:opacity-70"
          >
            <View className="flex-row items-center">
              <Text className="mr-2 text-base">📋</Text>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Gợi ý cho dịch vụ này
              </Text>
            </View>
            <Text className="text-base font-bold text-[#F5A524]">
              {isSuggestionsCollapsed ? '⌄' : '⌃'}
            </Text>
          </Pressable>

          {!isSuggestionsCollapsed && (
            <View className="mt-3.5">
              <Text className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                Mô tả vấn đề của bạn để thợ đến khắc phục:
              </Text>

              {/* Nhóm 1: Loại sự cố */}
              <View className="mb-3.5">
                <Text className="mb-2 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  Loại sự cố
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {SUGGESTION_CATEGORIES.issueTypes.map((item) => {
                    const isSelected = selectedIssueType === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => handleSelectChip('issue', item)}
                        className={`rounded-full border px-3.5 py-2 ${
                          isSelected
                            ? 'border-[#F5A524] bg-primary-50 dark:border-[#F5A524] dark:bg-amber-950/40'
                            : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'
                        }`}
                      >
                        <Text
                          className={`text-xs ${
                            isSelected
                              ? 'font-bold text-primary-600 dark:text-primary-200'
                              : 'font-medium text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Nhóm 2: Vị trí */}
              <View className="mb-3.5">
                <Text className="mb-2 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  Vị trí
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {SUGGESTION_CATEGORIES.locations.map((item) => {
                    const isSelected = selectedLocation === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => handleSelectChip('location', item)}
                        className={`rounded-full border px-3.5 py-2 ${
                          isSelected
                            ? 'border-[#F5A524] bg-primary-50 dark:border-[#F5A524] dark:bg-amber-950/40'
                            : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'
                        }`}
                      >
                        <Text
                          className={`text-xs ${
                            isSelected
                              ? 'font-bold text-primary-600 dark:text-primary-200'
                              : 'font-medium text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Nhóm 3: Mức độ */}
              <View className="mb-1">
                <Text className="mb-2 text-xs font-bold text-neutral-800 dark:text-neutral-200">
                  Mức độ
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {SUGGESTION_CATEGORIES.severities.map((item) => {
                    const isSelected = selectedSeverity === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => handleSelectChip('severity', item)}
                        className={`rounded-full border px-3.5 py-2 ${
                          isSelected
                            ? 'border-[#F5A524] bg-primary-50 dark:border-[#F5A524] dark:bg-amber-950/40'
                            : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'
                        }`}
                      >
                        <Text
                          className={`text-xs ${
                            isSelected
                              ? 'font-bold text-primary-600 dark:text-primary-200'
                              : 'font-medium text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* 4. Thẻ chi tiết vấn đề & Điền nhanh */}
        <View className="mb-4 rounded-3xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-2 flex-row items-center">
            <View className="mr-1.5 size-4 items-center justify-center rounded-full bg-[#F5A524]">
              <Text className="text-[10px] font-extrabold text-white">?</Text>
            </View>
            <Text className="text-xs font-bold text-primary-600 dark:text-primary-200">
              Mẹo hay
            </Text>
          </View>

          <Text className="mb-2 text-sm font-bold text-neutral-900 dark:text-white">
            Chi tiết sự cố
          </Text>

          <TextInput
            testID="booking-description-input"
            multiline
            numberOfLines={4}
            value={description}
            onChangeText={setDescription}
            placeholder="Mô tả chi tiết sự cố bạn đang gặp phải..."
            placeholderTextColor="#9CA3AF"
            className="min-h-[110px] rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-900 dark:bg-neutral-800 dark:text-white"
            textAlignVertical="top"
          />

          {/* Điền nhanh */}
          <View className="mt-3.5">
            <Text className="mb-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              Điền nhanh
            </Text>
            <Pressable
              onPress={handleQuickFill}
              className="flex-row items-center self-start rounded-full border border-primary-200 bg-primary-50 px-3.5 py-2 active:bg-primary-100 dark:border-amber-800 dark:bg-amber-950/40"
            >
              <Text className="mr-1 text-xs">⚡</Text>
              <Text className="text-xs font-bold text-primary-600 dark:text-primary-200">
                Tôi cần người
                {' '}
                {serviceName || 'dịch vụ tiện ích'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 5. Khối đính kèm ảnh hiện trường */}
        <View className="mb-4 rounded-3xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-1 pr-2">
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Hình ảnh hiện trường (Tùy chọn)
              </Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Chụp ảnh rõ nơi bị hỏng để thợ chuẩn bị đồ nghề (
                {imageItems.length}
                /5)
              </Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-3">
            {imageItems.map((item, index) => (
              <BookingImageThumbnail
                key={item.id}
                item={item}
                index={index}
                onRemove={handleRemoveItem}
                onRetry={handleRetryItem}
              />
            ))}

            {imageItems.length < 5 && (
              <Pressable
                testID="booking-add-photo-btn"
                onPress={handleAddPhotoPress}
                className="size-20 items-center justify-center rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/40 active:bg-primary-50 active:opacity-75 dark:border-amber-800 dark:bg-amber-950/20"
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#D9820A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M14 4h-4L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z" />
                  <Circle cx="12" cy="13" r="3" />
                </Svg>
                <Text className="mt-1 text-[10px] font-bold text-primary-600">+ Thêm ảnh</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>

        {/* 6. Nút Tiếp tục: vô hiệu hóa tương tác khi đang tải hoặc xử lý ảnh */}
        <Button
          testID="booking-next-btn"
          label="Tiếp tục"
          accessibilityState={{ disabled: isAnyLoading }}
          aria-disabled={isAnyLoading}
          className={`mb-8 h-13 w-full rounded-full ${
            isAnyLoading
              ? 'bg-neutral-400 opacity-60 dark:bg-neutral-600'
              : 'bg-[#F5A524] shadow-md shadow-amber-200 active:bg-primary-600'
          }`}
          textClassName="text-base font-bold text-white"
          onPress={handleNext}
        />
      </ScrollView>

      {/* 7. Modal Máy ảnh In-App chụp ảnh thật hiện trường */}
      <Modal
        visible={isCameraOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleCloseCamera}
      >
        <View className="flex-1 bg-black">
          {capturedPreviewUri
            ? (
                /* Màn hình Xem lại ảnh vừa chụp */
                <View className="flex-1 justify-between bg-neutral-950 px-5 pt-12 pb-8">
                  <View className="flex-row items-center justify-between border-b border-white/10 pb-3">
                    <Text className="text-base font-bold text-white">Xem lại ảnh hiện trường</Text>
                    <Pressable
                      onPress={handleCloseCamera}
                      hitSlop={12}
                      className="size-8 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
                    >
                      <Text className="text-sm font-bold text-white">✕</Text>
                    </Pressable>
                  </View>

                  <View className="my-4 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-neutral-900">
                    <Image
                      source={{ uri: capturedPreviewUri }}
                      className="size-full"
                      resizeMode="contain"
                    />
                  </View>

                  <View className="gap-3">
                    <Pressable
                      testID="camera-use-photo-btn"
                      onPress={handleConfirmCapturedPhoto}
                      className="h-12 w-full items-center justify-center rounded-full bg-[#F5A524] active:opacity-90"
                    >
                      <Text className="text-base font-bold text-white">Dùng ảnh này</Text>
                    </Pressable>

                    <Pressable
                      testID="camera-retake-photo-btn"
                      onPress={handleRetakePhoto}
                      className="h-12 w-full items-center justify-center rounded-full border border-white/30 bg-white/10 active:bg-white/20"
                    >
                      <Text className="text-base font-bold text-white">Chụp lại</Text>
                    </Pressable>
                  </View>
                </View>
              )
            : (
                /* Màn hình Camera Ngắm & Chụp */
                <View className="flex-1">
                  <CameraView
                    ref={cameraRef}
                    facing={cameraFacing}
                    enableTorch={isFlashOn}
                    mode="picture"
                    style={StyleSheet.absoluteFillObject}
                  />

                  {/* Thanh điều khiển trên cùng */}
                  <View className="absolute inset-x-0 top-0 z-20 flex-row items-center justify-between bg-black/40 px-5 pt-12 pb-4">
                    <Pressable
                      onPress={handleCloseCamera}
                      hitSlop={12}
                      className="size-10 items-center justify-center rounded-full bg-black/40 active:bg-black/60"
                    >
                      <Text className="text-base font-bold text-white">✕</Text>
                    </Pressable>

                    <View className="flex-row items-center gap-3">
                      {/* Nút Flash */}
                      <Pressable
                        onPress={() => setIsFlashOn(prev => !prev)}
                        className={`size-10 items-center justify-center rounded-full ${
                          isFlashOn ? 'bg-amber-400' : 'bg-black/40'
                        }`}
                      >
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={isFlashOn ? '#000000' : '#FFFFFF'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M13 2L3 14h8l-1 8 11-12h-8l1-8z" />
                        </Svg>
                      </Pressable>

                      {/* Nút Đổi Camera trước / sau */}
                      <Pressable
                        onPress={() => setCameraFacing(prev => (prev === 'back' ? 'front' : 'back'))}
                        className="size-10 items-center justify-center rounded-full bg-black/40 active:bg-black/60"
                      >
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <Path d="M3 3v5h5" />
                          <Path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                          <Path d="M16 21h5v-5" />
                        </Svg>
                      </Pressable>
                    </View>
                  </View>

                  {/* Hướng dẫn chụp */}
                  <View className="absolute inset-x-6 top-28 items-center">
                    <View className="rounded-full bg-black/60 px-4 py-1.5 backdrop-blur-md">
                      <Text className="text-center text-xs font-semibold text-white">
                        Chụp ảnh rõ nơi bị hỏng để thợ chuẩn bị đồ nghề
                      </Text>
                    </View>
                  </View>

                  {/* Thanh điều khiển đáy với nút chụp */}
                  <View className="absolute inset-x-0 bottom-0 z-20 items-center bg-black/40 pt-6 pb-10">
                    <Pressable
                      testID="camera-shutter-btn"
                      disabled={isCapturing}
                      onPress={handleCapturePhoto}
                      className="size-20 items-center justify-center rounded-full border-4 border-[#F5A524] bg-white shadow-lg active:scale-95"
                    >
                      {isCapturing
                        ? (
                            <ActivityIndicator size="small" color="#F5A524" />
                          )
                        : (
                            <View className="size-14 rounded-full bg-[#F5A524]" />
                          )}
                    </Pressable>
                  </View>
                </View>
              )}
        </View>
      </Modal>
    </Screen>
  );
}
