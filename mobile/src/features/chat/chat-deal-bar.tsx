import type { ChatConversation } from './types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useMyBidForRequest } from '@/features/bidding/hooks/use-worker-bidding';
import { candidateQueryKeys } from '@/features/candidates/hooks/candidate-query-keys';
import { useCandidates } from '@/features/candidates/hooks/use-candidates';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { AdjustBidModal } from './components/adjust-bid-modal';

export type ChatDealBarProps = {
  conversation: ChatConversation;
  userId: string;
  onSendMessage?: (content: string) => Promise<void>;
};

function formatCurrency(num: number): string {
  return `${num.toLocaleString('vi-VN')} đ`;
}

export function ChatDealBar({
  conversation,
  userId,
  onSendMessage,
}: ChatDealBarProps) {
  const queryClient = useQueryClient();
  const [isAdjustModalOpen, setIsAdjustModalOpen] = React.useState(false);
  const [isSubmittingProposal, setIsSubmittingProposal] = React.useState(false);

  const isWorker = userId === conversation.workerId;
  const isCustomer = userId === conversation.customerId;
  const hasOrder = Boolean(conversation.orderId);

  // Worker bid query
  const myBidQuery = useMyBidForRequest(
    conversation.requestId || '',
    !hasOrder && isWorker && Boolean(conversation.requestId),
  );
  const workerBidData = myBidQuery.data;

  // Customer candidates query
  const { bids: candidateBids } = useCandidates(
    conversation.requestId || '',
    { enabled: !hasOrder && isCustomer && Boolean(conversation.requestId) },
  );

  // Customer proposals query
  const { data: requestProposals } = useQuery({
    queryKey: ['orders', 'request-proposals', conversation.requestId],
    queryFn: async () => {
      if (!conversation.requestId) return [];
      const res = await OrdersApi.getProposalsForRequest(conversation.requestId);
      return res?.data || [];
    },
    enabled: !hasOrder && isCustomer && Boolean(conversation.requestId),
  });

  // Check finalized order status
  if (hasOrder) {
    return (
      <View
        style={{
          backgroundColor: '#F0FDF4',
          borderBottomWidth: 1,
          borderBottomColor: '#BBF7D0',
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A', marginRight: 8 }} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#166534' }}>
          Đã chốt đơn hàng
        </Text>
      </View>
    );
  }

  // Worker view
  if (isWorker) {
    if (!workerBidData || workerBidData.status !== 'active') {
      return null;
    }

    return (
      <>
        <View
          style={{
            backgroundColor: '#EFF6FF',
            borderBottomWidth: 1,
            borderBottomColor: '#DBEAFE',
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 12, color: '#475569' }}>Báo giá của bạn:</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E40AF' }}>
              {formatCurrency(workerBidData.amount)}
            </Text>
          </View>
          <Pressable
            testID="deal-bar-adjust-bid-btn"
            accessibilityRole="button"
            accessibilityLabel="Điều chỉnh giá báo"
            onPress={() => setIsAdjustModalOpen(true)}
            style={{
              backgroundColor: '#2563EB',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
              Điều chỉnh giá
            </Text>
          </Pressable>
        </View>

        <AdjustBidModal
          visible={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          bid={workerBidData}
          requestId={conversation.requestId}
          onSuccess={(newAmount, note) => {
            const notice = `[Báo giá mới] Tôi đã điều chỉnh giá dịch vụ thành ${formatCurrency(newAmount)}.${
              note ? ` Ghi chú: ${note}` : ''
            }`;
            void onSendMessage?.(notice);
          }}
        />
      </>
    );
  }

  // Customer view
  if (isCustomer) {
    const workerBid = candidateBids.find(
      b => b.workerUserId === conversation.workerId || b.workerId === conversation.workerId,
    );

    const activeProposal = requestProposals?.find(
      p => p.workerUserId === conversation.workerId && ['proposed', 'finalized'].includes(p.status),
    );

    if (activeProposal?.status === 'finalized') {
      return (
        <View
          style={{
            backgroundColor: '#F0FDF4',
            borderBottomWidth: 1,
            borderBottomColor: '#BBF7D0',
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A', marginRight: 8 }} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#166534' }}>
            Đã chốt đơn hàng
          </Text>
        </View>
      );
    }

    if (activeProposal?.status === 'proposed') {
      const agreedAmount = Number(activeProposal.agreedPrice) || workerBid?.amount || 0;
      return (
        <View
          style={{
            backgroundColor: '#FFFBEB',
            borderBottomWidth: 1,
            borderBottomColor: '#FDE68A',
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View>
            <Text style={{ fontSize: 12, color: '#92400E' }}>
              Đã gửi đề xuất: <Text style={{ fontWeight: '700' }}>{formatCurrency(agreedAmount)}</Text>
            </Text>
            <Text style={{ fontSize: 11, color: '#B45309', marginTop: 1 }}>
              Đang chờ thợ xác nhận nhận việc
            </Text>
          </View>
          <View
            style={{
              backgroundColor: '#FEF3C7',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: '#B45309', fontWeight: '500' }}>
              Chờ xác nhận
            </Text>
          </View>
        </View>
      );
    }

    if (workerBid && workerBid.status === 'active') {
      const handleSelectWorker = () => {
        Alert.alert(
          'Xác nhận chọn thợ',
          `Bạn có đồng ý chọn thợ ${conversation.workerName || ''} với mức giá ${formatCurrency(
            workerBid.amount,
          )} cho dịch vụ ${conversation.serviceName || 'yêu cầu'}?`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Đồng ý',
              onPress: async () => {
                setIsSubmittingProposal(true);
                try {
                  await OrdersApi.createProposal({
                    serviceRequestId: conversation.requestId,
                    workerUserId: conversation.workerId,
                    selectionSource: 'bid',
                    sourceBidId: workerBid.sourceBidId || workerBid.id,
                    agreedPrice: workerBid.amount,
                    agreedScope: conversation.serviceName || 'Dịch vụ đã trao đổi',
                  });

                  await queryClient.invalidateQueries({
                    queryKey: ['orders', 'request-proposals', conversation.requestId],
                  });
                  await queryClient.invalidateQueries({
                    queryKey: candidateQueryKeys.byRequest(conversation.requestId),
                  });

                  Alert.alert(
                    'Đã gửi đề xuất',
                    'Đề xuất đã được gửi thành công đến thợ. Vui lòng chờ thợ xác nhận nhận việc.',
                  );

                  void onSendMessage?.(
                    `Tôi đã gửi đề xuất chọn bạn với mức giá ${formatCurrency(
                      workerBid.amount,
                    )}. Vui lòng xác nhận đề xuất nhé!`,
                  );
                } catch (err: any) {
                  Alert.alert(
                    'Không thể gửi đề xuất',
                    err?.message || 'Có lỗi xảy ra khi gửi đề xuất chọn thợ.',
                  );
                } finally {
                  setIsSubmittingProposal(false);
                }
              },
            },
          ],
        );
      };

      return (
        <View
          style={{
            backgroundColor: '#F0FDF4',
            borderBottomWidth: 1,
            borderBottomColor: '#DCFCE7',
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: 12, color: '#166534' }}>Báo giá thợ:</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#15803D' }}>
              {formatCurrency(workerBid.amount)}
            </Text>
          </View>
          <Pressable
            testID="deal-bar-select-worker-btn"
            accessibilityRole="button"
            accessibilityLabel="Chọn thợ này"
            disabled={isSubmittingProposal}
            onPress={handleSelectWorker}
            style={{
              backgroundColor: isSubmittingProposal ? '#94A3B8' : '#16A34A',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              minWidth: 100,
              alignItems: 'center',
            }}
          >
            {isSubmittingProposal ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
                Chọn thợ này
              </Text>
            )}
          </Pressable>
        </View>
      );
    }
  }

  return null;
}
