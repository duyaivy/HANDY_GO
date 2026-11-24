import type { QuoteInvitation } from '../api/orders.api';
import * as React from 'react';
import { Alert, Modal, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { OrdersApi } from '../api/orders.api';

type QuoteInvitationModalProps = {
  requestId: string;
  worker: { id: string; name: string; sourceMatchResultId: string };
  onClose: () => void;
  onSent: (invitation: QuoteInvitation) => void;
};

export function QuoteInvitationModal({ requestId, worker, onClose, onSent }: QuoteInvitationModalProps) {
  const [note, setNote] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const sending = React.useRef(false);

  const send = async () => {
    if (sending.current)
      return;
    sending.current = true;
    setPending(true);
    try {
      const { data } = await OrdersApi.createQuoteInvitation(requestId, {
        workerUserId: worker.id,
        sourceMatchResultId: worker.sourceMatchResultId,
        note: note.trim() || undefined,
      });
      onSent(data);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Vui lòng thử lại.';
      Alert.alert('Không thể gửi lời mời', message);
    }
    finally {
      sending.current = false;
      setPending(false);
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={() => {
        if (!pending)
          onClose();
      }}
    >
      <View className="flex-1 justify-center bg-black/40 px-6">
        <View className="gap-3 rounded-2xl bg-white p-5 dark:bg-neutral-800">
          <Text className="text-lg font-bold">
            Hỏi giá thợ
            {' '}
            {worker.name}
          </Text>
          <Text>Gửi lời mời báo giá. Bạn có thể nhắn tin sau khi thợ gửi báo giá.</Text>
          <TextInput
            accessibilityLabel="Lời nhắn cho thợ"
            className="min-h-24 rounded-xl border border-neutral-300 p-3 text-neutral-900 dark:text-white"
            editable={!pending}
            maxLength={500}
            multiline
            onChangeText={setNote}
            placeholder="Câu hỏi hoặc thông tin thêm (không bắt buộc)"
            value={note}
          />
          <Button label="Gửi hỏi giá" variant="primary" loading={pending} onPress={send} />
          <Button label="Hủy" variant="ghost" disabled={pending} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
