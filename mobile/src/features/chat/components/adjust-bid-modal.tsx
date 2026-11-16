import type { BidDetail } from '@/features/bidding/api/worker-bidding.api';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/icons/handy-icons';
import { useReviseBid } from '@/features/bidding/hooks/use-worker-bidding';
import { workerBiddingKeys } from '@/features/candidates/hooks/candidate-query-keys';

export type AdjustBidModalProps = {
  visible: boolean;
  onClose: () => void;
  bid: BidDetail;
  requestId: string;
  onSuccess?: (newAmount: number, message?: string) => void;
  cooldownCheck?: boolean;
};

const MAX_REVISIONS = 5;
const COOLDOWN_MS = 120000; // 2 minutes per contract
const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 500000000;

function formatCurrency(num: number): string {
  return `${num.toLocaleString('vi-VN')} đ`;
}

export function AdjustBidModal({
  visible,
  onClose,
  bid,
  requestId,
  onSuccess,
  cooldownCheck,
}: AdjustBidModalProps) {
  const queryClient = useQueryClient();
  const reviseBidMutation = useReviseBid(requestId);
  const [amountStr, setAmountStr] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Initialize input when modal opens
  React.useEffect(() => {
    if (visible) {
      setAmountStr(String(bid.amount));
      setMessage(bid.message || '');
      setValidationError(null);
    }
  }, [visible, bid.amount, bid.message]);

  const revisionsCount = bid.revisionsCount ?? 0;
  const revisionsLeft = Math.max(0, MAX_REVISIONS - revisionsCount);
  const isMaxRevisions = revisionsLeft <= 0;

  // 2-minute cooldown tracking
  const lastUpdateTimestamp = React.useMemo(() => {
    if (bid.revisions && bid.revisions.length > 0) {
      const lastRev = bid.revisions[bid.revisions.length - 1];
      return new Date(lastRev.revisedAt).getTime();
    }
    return bid.submittedAt ? new Date(bid.submittedAt).getTime() : null;
  }, [bid]);

  const [cooldownNow, setCooldownNow] = React.useState(() => Date.now());
  const cooldownEnabled = visible && lastUpdateTimestamp !== null && (cooldownCheck ?? (process.env.NODE_ENV !== 'test'));
  const cooldownRemainingSec = cooldownEnabled
    ? Math.max(0, Math.ceil((lastUpdateTimestamp + COOLDOWN_MS - cooldownNow) / 1000))
    : 0;

  React.useEffect(() => {
    if (!cooldownEnabled) return;
    const interval = setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [cooldownEnabled]);

  const isCooldownActive = cooldownRemainingSec > 0;
  const isSubmitting = reviseBidMutation.isPending;

  const handleAmountChange = (text: string) => {
    const numeric = text.replace(/[^0-9]/g, '');
    setAmountStr(numeric);
    if (validationError) setValidationError(null);
  };

  const handleSubmit = async () => {
    const numericAmount = Number(amountStr);
    if (isNaN(numericAmount) || numericAmount < MIN_AMOUNT) {
      setValidationError(`Số tiền tối thiểu là ${formatCurrency(MIN_AMOUNT)}`);
      return;
    }
    if (numericAmount > MAX_AMOUNT) {
      setValidationError(`Số tiền tối đa là ${formatCurrency(MAX_AMOUNT)}`);
      return;
    }

    try {
      const cleanMessage = message.trim();
      await reviseBidMutation.mutateAsync({
        bidId: bid.id,
        payload: {
          version: bid.version,
          amount: numericAmount,
          message: cleanMessage || undefined,
        },
      });

      Alert.alert('Thành công', 'Đã điều chỉnh giá báo thành công!');
      onSuccess?.(numericAmount, cleanMessage || undefined);
      onClose();
    } catch (err: any) {
      const isConflict = err?.statusCode === 409 || err?.response?.status === 409;
      if (isConflict) {
        void queryClient.invalidateQueries({
          queryKey: workerBiddingKeys.myBidForRequest(bid.workerId, requestId),
        });
        Alert.alert(
          'Xung đột phiên bản',
          'Báo giá đã thay đổi trên hệ thống. Bạn có muốn tải lại dữ liệu mới nhất không?',
          [
            { text: 'Hủy', style: 'cancel', onPress: onClose },
            {
              text: 'Tải lại',
              onPress: async () => {
                await queryClient.refetchQueries({
                  queryKey: workerBiddingKeys.myBidForRequest(bid.workerId, requestId),
                });
              },
            },
          ],
        );
      } else {
        Alert.alert(
          'Không thể cập nhật giá',
          err?.message || 'Có lỗi xảy ra khi cập nhật giá. Vui lòng thử lại.',
        );
      }
    }
  };

  const submitDisabled = isMaxRevisions || isCooldownActive || isSubmitting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', padding: 20 }}
      >
        <View
          style={{
            backgroundColor: 'white',
            borderRadius: 20,
            overflow: 'hidden',
            maxHeight: '85%',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F5F9',
            }}
          >
            <View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>
                Điều chỉnh báo giá
              </Text>
              <Text style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                Báo giá hiện tại: <Text style={{ fontWeight: '600', color: '#2563EB' }}>{formatCurrency(bid.amount)}</Text>
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={onClose}
              hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
            >
              <CloseIcon size={18} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 20 }}>
            {/* Revision Limit & Cooldown Notices */}
            {isMaxRevisions ? (
              <View style={{ backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, marginBottom: 16 }}>
                <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '500' }}>
                  Bạn đã đạt tối đa 5 lần điều chỉnh giá.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 12, color: '#64748B' }}>
                  Còn {revisionsLeft} lần điều chỉnh
                </Text>
                {isCooldownActive && (
                  <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '500' }}>
                    Chờ {cooldownRemainingSec}s để sửa tiếp
                  </Text>
                )}
              </View>
            )}

            {/* Price Input */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 }}>
                Mức giá mới (VNĐ) <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              <TextInput
                value={amountStr}
                onChangeText={handleAmountChange}
                placeholder="Nhập số tiền (VNĐ)"
                keyboardType="numeric"
                editable={!isMaxRevisions && !isCooldownActive && !isSubmitting}
                style={{
                  borderWidth: 1,
                  borderColor: validationError ? '#EF4444' : '#CBD5E1',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  color: '#0F172A',
                  backgroundColor: isMaxRevisions || isCooldownActive ? '#F8FAFC' : 'white',
                }}
              />
              {validationError ? (
                <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
                  {validationError}
                </Text>
              ) : amountStr && !isNaN(Number(amountStr)) && Number(amountStr) > 0 ? (
                <Text style={{ color: '#2563EB', fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                  = {formatCurrency(Number(amountStr))}
                </Text>
              ) : null}
            </View>

            {/* Note / Message Input */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 }}>
                Lời nhắn / Ghi chú
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Ghi chú cho khách (không bắt buộc)"
                multiline
                numberOfLines={3}
                maxLength={500}
                editable={!isMaxRevisions && !isCooldownActive && !isSubmitting}
                style={{
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: '#0F172A',
                  minHeight: 70,
                  textAlignVertical: 'top',
                  backgroundColor: isMaxRevisions || isCooldownActive ? '#F8FAFC' : 'white',
                }}
              />
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 12 }}>
              <Button
                label="Hủy"
                variant="outline"
                className="flex-1"
                onPress={onClose}
                disabled={isSubmitting}
              />
              <Button
                label={isSubmitting ? 'Đang lưu…' : 'Xác nhận sửa'}
                testID="submit-adjust-bid-btn"
                className="flex-1"
                loading={isSubmitting}
                disabled={submitDisabled}
                onPress={handleSubmit}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
