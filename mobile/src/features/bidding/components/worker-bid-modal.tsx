import type { DiscoverableJobItem } from '../api/worker-discovery.api';
import type { BidDetail } from '../api/worker-bidding.api';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  useReviseBid,
  useRoundStatus,
  useSubmitBid,
  useWithdrawBid,
} from '../hooks/use-worker-bidding';

export type WorkerBidModalProps = {
  visible: boolean;
  onClose: () => void;
  request: DiscoverableJobItem | null;
  existingBid?: BidDetail | null;
  onSuccess?: () => void;
};

const MAX_REVISIONS = 5;
const COOLDOWN_MS = 120000; // 2 minutes cooldown per Contract Section 4.2

export function WorkerBidModal({
  existingBid,
  onClose,
  onSuccess,
  request,
  visible,
}: WorkerBidModalProps) {
  const requestId = request?.id || '';

  const { data: roundStatus, isLoading: isLoadingStatus } = useRoundStatus(
    requestId,
    visible,
  );

  const submitBidMutation = useSubmitBid(requestId);
  const reviseBidMutation = useReviseBid(requestId);
  const withdrawBidMutation = useWithdrawBid(requestId);

  const [amountStr, setAmountStr] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [withdrawReason, setWithdrawReason] = React.useState('');
  const [showWithdrawInput, setShowWithdrawInput] = React.useState(false);

  // Initialize or reset form fields when modal opens or existingBid changes
  React.useEffect(() => {
    if (visible) {
      if (existingBid && existingBid.status === 'active') {
        setAmountStr(String(existingBid.amount));
        setMessage(existingBid.message || '');
      }
      else {
        setAmountStr('');
        setMessage('');
      }
      setShowWithdrawInput(false);
      setWithdrawReason('');
    }
  }, [visible, existingBid]);

  const isRoundOpen = roundStatus?.status === 'open' && !roundStatus?.isExpired;
  const revisionsCount = existingBid?.revisionsCount ?? 0;
  const revisionsLeft = Math.max(0, MAX_REVISIONS - revisionsCount);

  // 2-minute cooldown tracking between revisions
  const lastUpdateTimestamp = React.useMemo(() => {
    if (!existingBid)
      return null;
    if (existingBid.revisions && existingBid.revisions.length > 0) {
      const lastRev = existingBid.revisions[existingBid.revisions.length - 1];
      return new Date(lastRev.revisedAt).getTime();
    }
    return existingBid.submittedAt ? new Date(existingBid.submittedAt).getTime() : null;
  }, [existingBid]);

  const [cooldownRemainingSec, setCooldownRemainingSec] = React.useState(0);

  React.useEffect(() => {
    if (!visible || !lastUpdateTimestamp || process.env.NODE_ENV === 'test') {
      setCooldownRemainingSec(0);
      return;
    }

    const checkCooldown = () => {
      const elapsed = Date.now() - lastUpdateTimestamp;
      const remainingMs = COOLDOWN_MS - elapsed;
      if (remainingMs > 0) {
        setCooldownRemainingSec(Math.ceil(remainingMs / 1000));
      }
      else {
        setCooldownRemainingSec(0);
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, [visible, lastUpdateTimestamp]);

  const isCooldownActive = cooldownRemainingSec > 0;
  const canRevise = Boolean(existingBid && existingBid.status === 'active' && revisionsLeft > 0 && !isCooldownActive);

  const handleFormatAmount = (text: string) => {
    // Only allow numbers
    const clean = text.replace(/\D/g, '');
    setAmountStr(clean);
  };

  const displayFormattedAmount = React.useMemo(() => {
    const num = Number(amountStr);
    if (!num || Number.isNaN(num))
      return '';
    return `${num.toLocaleString('vi-VN')} đ`;
  }, [amountStr]);

  const handleSubmit = async () => {
    const amount = Number(amountStr);
    if (!amount || Number.isNaN(amount) || amount < 1000) {
      Alert.alert('Giá không hợp lệ', 'Mức giá báo giá tối thiểu là 1.000 VNĐ');
      return;
    }

    if (amount > 9999999999) {
      Alert.alert('Giá không hợp lệ', 'Mức giá báo giá tối đa là 9.999.999.999 VNĐ');
      return;
    }

    if (existingBid && existingBid.status === 'active') {
      if (revisionsLeft <= 0) {
        Alert.alert('Giới hạn điều chỉnh', `Bạn đã đạt tối đa ${MAX_REVISIONS} lần điều chỉnh báo giá cho phiên này.`);
        return;
      }
      if (isCooldownActive) {
        Alert.alert(
          'Giãn cách sửa báo giá',
          `Vui lòng đợi thêm ${cooldownRemainingSec} giây trước khi gửi lần điều chỉnh tiếp theo (quy định tối thiểu 2 phút giữa các lần sửa).`,
        );
        return;
      }
    }

    try {
      if (existingBid && existingBid.status === 'active') {
        // Revision flow with optimistic locking version
        await reviseBidMutation.mutateAsync({
          bidId: existingBid.id,
          payload: {
            version: existingBid.version,
            amount,
            message: message.trim() || undefined,
          },
        });
        Alert.alert('Thành công', 'Báo giá đã được cập nhật thành công!');
      }
      else {
        // New bid flow
        await submitBidMutation.mutateAsync({
          amount,
          message: message.trim() || undefined,
        });
        Alert.alert('Thành công', 'Đã gửi báo giá tới khách hàng!');
      }

      onSuccess?.();
      onClose();
    }
    catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Có lỗi xảy ra, vui lòng thử lại';
      Alert.alert('Không thể gửi báo giá', msg);
    }
  };

  const handleWithdraw = () => {
    if (!existingBid)
      return;

    Alert.alert(
      'Rút báo giá',
      'Bạn có chắc chắn muốn rút báo giá này không? Sau khi rút, bạn có thể không thể gửi lại báo giá cho yêu cầu này.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận rút',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawBidMutation.mutateAsync({
                bidId: existingBid.id,
                payload: {
                  version: existingBid.version,
                  reason: withdrawReason.trim() || undefined,
                },
              });
              Alert.alert('Thành công', 'Báo giá đã được rút thành công');
              onSuccess?.();
              onClose();
            }
            catch (err: any) {
              const msg = err?.response?.data?.message || err?.message || 'Không thể rút báo giá';
              Alert.alert('Lỗi rút báo giá', msg);
            }
          },
        },
      ],
    );
  };

  const isSubmitting = submitBidMutation.isPending || reviseBidMutation.isPending || withdrawBidMutation.isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="max-h-[90%] rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-neutral-900">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <View className="flex-1 mr-3">
              <Text className="text-lg font-black text-neutral-900 dark:text-white" numberOfLines={1}>
                {existingBid && existingBid.status === 'active' ? 'Điều chỉnh báo giá' : 'Gửi báo giá dịch vụ'}
              </Text>
              <Text className="text-xs font-semibold text-neutral-400">
                #{request?.requestCode || request?.id?.slice(0, 8)}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2}>
                <Path d="M18 6L6 18M6 6l12 12" />
              </Svg>
            </Pressable>
          </View>

          <ScrollView className="mt-3" showsVerticalScrollIndicator={false}>
            {/* Round Status Info */}
            <View className="mb-4 rounded-xl bg-blue-50 p-3 dark:bg-blue-950/40">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
                  {isLoadingStatus ? 'Đang kiểm tra phiên...' : isRoundOpen ? 'Phiên đấu giá đang mở' : 'Phiên đấu giá đã kết thúc'}
                </Text>
                {roundStatus && (
                  <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {roundStatus.bidCount} thợ đã báo giá
                  </Text>
                )}
              </View>
              {roundStatus?.timeRemainingSeconds ? (
                <Text className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  Thời gian còn lại: {Math.floor(roundStatus.timeRemainingSeconds / 60)} phút
                </Text>
              ) : null}
            </View>

            {/* Request Summary */}
            {request && (
              <View className="mb-4 rounded-xl border border-neutral-100 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/50">
                <Text className="text-xs font-bold text-neutral-500 uppercase">Yêu cầu từ khách hàng</Text>
                <Text className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">
                  {request.description || 'Không có mô tả chi tiết'}
                </Text>
                {request.addressText && (
                  <Text className="mt-1.5 text-xs text-neutral-500" numberOfLines={2}>
                    Địa chỉ: {request.addressText}
                  </Text>
                )}
                {typeof request.distanceKm === 'number' && (
                  <Text className="mt-1 text-xs font-semibold text-[#2563EB]">
                    Khoảng cách: ~{request.distanceKm.toFixed(1)} km
                  </Text>
                )}
              </View>
            )}

            {/* Existing Bid Warning / Revision limits */}
            {existingBid && existingBid.status === 'active' && (
              <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                <Text className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Báo giá hiện tại: {existingBid.amount.toLocaleString('vi-VN')} đ (Phiên bản v{existingBid.version})
                </Text>
                <Text className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Số lần sửa còn lại: {revisionsLeft}/{MAX_REVISIONS}. Giãn cách tối thiểu giữa 2 lần sửa: 2 phút.
                </Text>
                {isCooldownActive && (
                  <View className="mt-2 flex-row items-center rounded-md bg-amber-100 px-2.5 py-1.5 dark:bg-amber-900/60">
                    <Text className="text-xs font-black text-amber-900 dark:text-amber-200">
                      ⏱ Đang trong thời gian chờ: còn {cooldownRemainingSec}s mới được sửa tiếp
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Amount Input */}
            <View className="mb-3">
              <Text className="mb-1 text-sm font-bold text-neutral-700 dark:text-neutral-300">
                Mức giá đề xuất (VNĐ) <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                keyboardType="numeric"
                value={amountStr}
                onChangeText={handleFormatAmount}
                placeholder="Nhập số tiền (VD: 250000)"
                placeholderTextColor="#9CA3AF"
                className="h-12 rounded-xl border border-neutral-300 bg-neutral-50 px-4 text-base font-bold text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              {displayFormattedAmount ? (
                <Text className="mt-1 text-sm font-black text-[#F5A524]">
                  {displayFormattedAmount}
                </Text>
              ) : null}
            </View>

            {/* Message Input */}
            <View className="mb-4">
              <Text className="mb-1 text-sm font-bold text-neutral-700 dark:text-neutral-300">
                Tin nhắn tới khách hàng (Tùy chọn)
              </Text>
              <TextInput
                multiline
                numberOfLines={3}
                value={message}
                onChangeText={setMessage}
                maxLength={1000}
                placeholder="Thời gian có thể đến, cam kết bảo hành, kinh nghiệm..."
                placeholderTextColor="#9CA3AF"
                className="min-h-[80px] rounded-xl border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                textAlignVertical="top"
              />
              <Text className="mt-1 text-right text-xs text-neutral-400">
                {message.length}/1000 ký tự
              </Text>
            </View>

            {/* Sealed Bid Privacy Note */}
            <View className="mb-5 flex-row items-center rounded-lg bg-neutral-100 p-2.5 dark:bg-neutral-800">
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2}>
                <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </Svg>
              <Text className="ml-2 flex-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                Đấu thầu kín: Mức giá của bạn chỉ hiển thị cho khách hàng sở hữu yêu cầu. Thợ đối thủ không thể xem.
              </Text>
            </View>

            {/* Action Buttons */}
            <View className="gap-2.5 pb-4">
              <Button
                variant="primary"
                onPress={handleSubmit}
                disabled={isSubmitting || !amountStr || (existingBid?.status === 'active' && !canRevise)}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : isCooldownActive ? (
                  `Chờ ${cooldownRemainingSec}s để cập nhật`
                ) : existingBid && existingBid.status === 'active' ? (
                  'Cập nhật báo giá'
                ) : (
                  'Gửi báo giá'
                )}
              </Button>

              {existingBid && existingBid.status === 'active' && (
                <Button
                  variant="destructive"
                  onPress={handleWithdraw}
                  disabled={isSubmitting}
                >
                  Rút báo giá
                </Button>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
