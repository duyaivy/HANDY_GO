import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/use-auth-store';
import { ChatApi, chatErrorMessage } from './chat-api';

export function ChatEntry({
  bidId,
  name,
  onOpen,
  enabled = true,
}: {
  bidId?: string | null;
  name?: string;
  onOpen?: () => void;
  enabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const opening = useRef(false);
  const userId = useAuthStore(state =>
    state.isAuthenticated ? state.user?.id : null,
  );
  if (!enabled)
    return null;
  const disabled = pending || !bidId || !userId;
  return (
    <Button
      label="Nhắn tin"
      variant="outline"
      loading={pending}
      accessibilityRole="button"
      accessibilityLabel="Nhắn tin"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={async () => {
        if (disabled || !bidId || opening.current)
          return;
        opening.current = true;
        setPending(true);
        try {
          const conversation = await ChatApi.create(bidId);
          if (!conversation.permissions.read || !conversation.permissions.send)
            throw new Error('Denied');
          onOpen?.();
          router.push(
            `/chat/${conversation.id}${name ? `?name=${encodeURIComponent(name)}` : ''}` as Href,
          );
        }
        catch (error) {
          Alert.alert('Chưa thể nhắn tin', chatErrorMessage(error));
        }
        finally {
          opening.current = false;
          setPending(false);
        }
      }}
    />
  );
}
