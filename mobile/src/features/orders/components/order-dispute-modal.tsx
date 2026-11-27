import type { DisputeCategory, OpenDisputePayload } from '../types/order.types';
import * as ImagePicker from 'expo-image-picker';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { CameraIcon, CloseIcon, ShieldCheckIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { OrdersApi } from '../api/orders.api';
import {
  DISPUTE_CATEGORY_OPTIONS,
  DISPUTE_MAX_EVIDENCE_URLS,
  DISPUTE_MAX_REASON_LENGTH,
  DISPUTE_MIN_REASON_LENGTH,
  DISPUTE_QUICK_REASONS,
  getDisputeErrorMessage,
} from '../utils/dispute-utils';

export type OrderDisputeModalProps = {
  visible: boolean;
  role?: 'customer' | 'worker';
  orderCode?: string;
  isPostCompletion?: boolean;
  remainingDays?: number;
  isSubmitting?: boolean;
  onSubmit: (payload: OpenDisputePayload) => Promise<unknown>;
  onSuccess?: () => void;
  onClose: () => void;
};

type DisputeMediaItem = {
  id: string;
  localUri: string;
  remoteUrl?: string;
  status: 'uploading' | 'completed' | 'error';
  errorMessage?: string;
};

export function OrderDisputeModal({
  visible,
  role = 'customer',
  orderCode,
  isPostCompletion = false,
  remainingDays = 0,
  isSubmitting = false,
  onSubmit,
  onSuccess,
  onClose,
}: OrderDisputeModalProps) {
  const [category, setCategory] = React.useState<DisputeCategory>('service_quality');
  const [reason, setReason] = React.useState('');
  const [mediaItems, setMediaItems] = React.useState<DisputeMediaItem[]>([]);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets?.bottom ?? 0, 16) + 16;

  const resetForm = React.useCallback(() => {
    setCategory(role === 'worker' ? 'other' : 'service_quality');
    setReason('');
    setMediaItems([]);
    setValidationError(null);
    setSubmitError(null);
  }, [role]);

  const handleClose = React.useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const isUploadingAny = mediaItems.some(item => item.status === 'uploading');
  const quickReasons = DISPUTE_QUICK_REASONS[role];

  const uploadSelectedAssets = async (
    assets: ReadonlyArray<{ uri: string }>,
    remainingSlots: number,
  ) => {
    const newItems: DisputeMediaItem[] = assets.slice(0, remainingSlots).map((asset, idx) => ({
      id: `dispute-img-${Date.now()}-${idx}`,
      localUri: asset.uri,
      status: 'uploading',
    }));

    setMediaItems(prev => [...prev, ...newItems]);

    await Promise.all(
      newItems.map(async (item) => {
        try {
          const uploaded = await OrdersApi.uploadImageDetailed(item.localUri, `dispute_${item.id}`);
          setMediaItems(prev =>
            prev.map(cur => (cur.id === item.id
              ? { ...cur, remoteUrl: uploaded.url, status: 'completed' }
              : cur)),
          );
        }
        catch (err: any) {
          setMediaItems(prev =>
            prev.map(cur => (cur.id === item.id
              ? { ...cur, status: 'error', errorMessage: err?.message || 'Tải ảnh thất bại' }
              : cur)),
          );
        }
      }),
    );
  };

  const pickFromLibrary = async (remainingSlots: number) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh để đính kèm bằng chứng khiếu nại.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      await uploadSelectedAssets(result.assets, remainingSlots);
    }
    catch {
      Alert.alert('Không thể chọn ảnh', 'Đã xảy ra lỗi khi mở thư viện ảnh. Vui lòng thử lại.');
    }
  };

  const captureFromCamera = async (remainingSlots: number) => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền sử dụng camera để chụp ảnh bằng chứng khiếu nại.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      await uploadSelectedAssets(result.assets, remainingSlots);
    }
    catch {
      Alert.alert('Không thể chụp ảnh', 'Đã xảy ra lỗi khi mở camera. Vui lòng thử lại.');
    }
  };

  const handlePickEvidenceImages = () => {
    const remainingSlots = DISPUTE_MAX_EVIDENCE_URLS - mediaItems.length;
    if (remainingSlots <= 0) {
      Alert.alert('Đã đạt giới hạn', `Bạn chỉ có thể đính kèm tối đa ${DISPUTE_MAX_EVIDENCE_URLS} ảnh bằng chứng.`);
      return;
    }

    Alert.alert('Thêm ảnh bằng chứng', 'Chọn nguồn ảnh', [
      {
        text: 'Chụp ảnh',
        onPress: () => {
          void captureFromCamera(remainingSlots);
        },
      },
      {
        text: 'Chọn từ thư viện',
        onPress: () => {
          void pickFromLibrary(remainingSlots);
        },
      },
      { text: 'Hủy', style: 'cancel' },
    ]);
  };

  const handleRemoveMedia = (id: string) => {
    setMediaItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmit = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < DISPUTE_MIN_REASON_LENGTH) {
      setValidationError(`Vui lòng mô tả lý do khiếu nại tối thiểu ${DISPUTE_MIN_REASON_LENGTH} ký tự.`);
      return;
    }
    if (trimmedReason.length > DISPUTE_MAX_REASON_LENGTH) {
      setValidationError(`Lý do khiếu nại không được vượt quá ${DISPUTE_MAX_REASON_LENGTH} ký tự.`);
      return;
    }
    if (isUploadingAny) {
      setValidationError('Vui lòng chờ ảnh bằng chứng tải lên hoàn tất.');
      return;
    }

    setValidationError(null);
    setSubmitError(null);

    const evidenceUrls = mediaItems
      .filter(item => item.status === 'completed' && Boolean(item.remoteUrl))
      .map(item => item.remoteUrl!);

    try {
      await onSubmit({
        reason: trimmedReason,
        category,
        evidenceUrls,
      });
      onSuccess?.();
      handleClose();
    }
    catch (error) {
      setSubmitError(getDisputeErrorMessage(error));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/60"
      >
        <View
          testID="order-dispute-modal"
          style={{ paddingBottom: bottomPadding }}
          className="max-h-[85%] rounded-t-3xl bg-white px-5 pt-4 dark:bg-neutral-900"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold text-neutral-900 dark:text-white">
                {isPostCompletion ? 'Khiếu nại bảo hành đơn hàng' : 'Mở khiếu nại / Tranh chấp'}
              </Text>
              {orderCode
                ? (
                    <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      Mã đơn: #
                      {orderCode}
                    </Text>
                  )
                : null}
            </View>
            <Pressable
              testID="dispute-modal-close-btn"
              accessibilityRole="button"
              accessibilityLabel="Đóng hộp thoại khiếu nại"
              onPress={handleClose}
              className="size-9 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800"
            >
              <CloseIcon size={18} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView className="mt-3" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* 7-day warranty badge */}
            {isPostCompletion && (
              <View
                testID="dispute-warranty-notice"
                className="mb-4 flex-row items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20"
              >
                <ShieldCheckIcon size={18} color="#D97706" />
                <Text className="flex-1 text-xs/5 text-amber-800 dark:text-amber-300">
                  Đơn hàng đang trong thời hạn bảo hành 7 ngày (còn khoảng
                  {' '}
                  {remainingDays}
                  {' '}
                  ngày). Quản trị viên sẽ xem xét và phản hồi sớm nhất.
                </Text>
              </View>
            )}

            {/* Category Selection */}
            <Text className="mb-2 text-xs font-bold tracking-wide text-neutral-600 uppercase dark:text-neutral-400">
              Loại vấn đề
            </Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {DISPUTE_CATEGORY_OPTIONS.map((option) => {
                const isSelected = category === option.value;
                return (
                  <Pressable
                    key={option.value}
                    testID={`dispute-category-${option.value}`}
                    accessibilityRole="button"
                    onPress={() => setCategory(option.value)}
                    className={`rounded-xl border px-3 py-2 ${isSelected
                      ? 'border-rose-500 bg-rose-50 dark:border-rose-500 dark:bg-rose-950/40'
                      : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${isSelected
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Quick Reason Chips */}
            <Text className="mb-2 text-xs font-bold tracking-wide text-neutral-600 uppercase dark:text-neutral-400">
              Chọn nhanh lý do
            </Text>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {quickReasons.map((chip, index) => (
                <Pressable
                  key={chip}
                  testID={`dispute-quick-reason-${index}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setReason(chip);
                    setValidationError(null);
                  }}
                  className="rounded-xl border border-neutral-200 bg-white px-2.5 py-1.5 active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
                >
                  <Text className="text-[11px] text-neutral-700 dark:text-neutral-300">
                    {chip}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Reason TextInput */}
            <Text className="mb-1.5 text-xs font-bold tracking-wide text-neutral-600 uppercase dark:text-neutral-400">
              Mô tả chi tiết *
            </Text>
            <TextInput
              testID="dispute-reason-input"
              value={reason}
              onChangeText={(text) => {
                setReason(text);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              placeholder="Mô tả rõ sự cố bạn gặp phải (tối thiểu 5 ký tự)..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              maxLength={DISPUTE_MAX_REASON_LENGTH}
              textAlignVertical="top"
              className="min-h-[100px] rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="text-[11px] text-rose-600 dark:text-rose-400">
                {validationError || ''}
              </Text>
              <Text className="text-[11px] text-neutral-400">
                {reason.trim().length}
                /
                {DISPUTE_MAX_REASON_LENGTH}
              </Text>
            </View>

            {/* Evidence Photos */}
            <View className="mt-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-bold tracking-wide text-neutral-600 uppercase dark:text-neutral-400">
                  Ảnh bằng chứng (Tối đa
                  {' '}
                  {DISPUTE_MAX_EVIDENCE_URLS}
                  )
                </Text>
                <Pressable
                  testID="dispute-add-evidence-btn"
                  accessibilityRole="button"
                  onPress={handlePickEvidenceImages}
                  className="flex-row items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-1.5 active:bg-neutral-200 dark:bg-neutral-800"
                >
                  <CameraIcon size={15} color="#E11D48" />
                  <Text className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    Thêm ảnh
                  </Text>
                </Pressable>
              </View>

              {mediaItems.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mt-3"
                  contentContainerStyle={{ gap: 10 }}
                >
                  {mediaItems.map(item => (
                    <View
                      key={item.id}
                      className="relative size-20 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-700"
                    >
                      <Image
                        source={{ uri: item.localUri }}
                        className="size-full"
                        resizeMode="cover"
                      />
                      {item.status === 'uploading' && (
                        <View className="absolute inset-0 items-center justify-center bg-black/50">
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        </View>
                      )}
                      {item.status === 'error' && (
                        <View className="absolute inset-0 items-center justify-center bg-rose-900/75 px-1">
                          <Text className="text-center text-[10px] font-bold text-white">
                            Lỗi tải
                          </Text>
                        </View>
                      )}
                      <Pressable
                        testID={`dispute-remove-media-${item.id}`}
                        accessibilityRole="button"
                        accessibilityLabel="Xóa ảnh bằng chứng"
                        onPress={() => handleRemoveMedia(item.id)}
                        className="absolute top-1 right-1 size-5 items-center justify-center rounded-full bg-black/70"
                      >
                        <CloseIcon size={12} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Server Error Banner */}
            {submitError
              ? (
                  <View
                    testID="dispute-submit-error"
                    className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-rose-950/30"
                  >
                    <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                      {submitError}
                    </Text>
                  </View>
                )
              : null}
          </ScrollView>

          {/* Footer Submit Actions */}
          <View className="mt-4 flex-row gap-2.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <Button
              testID="dispute-cancel-btn"
              label="Hủy bỏ"
              variant="outline"
              disabled={isSubmitting}
              className="h-11 flex-1 rounded-2xl border-neutral-300"
              textClassName="text-xs font-bold text-neutral-700 dark:text-neutral-300"
              onPress={handleClose}
            />
            <Button
              testID="dispute-submit-btn"
              label={isSubmitting ? 'Đang gửi...' : 'Gửi khiếu nại'}
              variant="default"
              disabled={isSubmitting || isUploadingAny}
              className="h-11 flex-1 rounded-2xl bg-rose-600 active:bg-rose-700"
              textClassName="text-xs font-bold text-white"
              onPress={handleSubmit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
