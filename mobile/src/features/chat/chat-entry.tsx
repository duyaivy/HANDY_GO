import type { Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
  const userId = useAuthStore(state =>
    state.isAuthenticated ? state.user?.id : null,
  );
  const eligibility = useQuery({
    queryKey: ['chat', userId, 'bid', bidId],
    queryFn: () => ChatApi.create(bidId!),
    enabled: Boolean(enabled && bidId && userId),
    staleTime: 5000,
    retry: false,
  });
  if (!bidId || !enabled || !eligibility.data?.permissions.send)
    return null;
  return (
    <Button
      label="Nhắn tin"
      variant="outline"
      loading={pending}
      disabled={pending}
      onPress={async () => {
        setPending(true);
        try {
          const conversation = await ChatApi.create(bidId);
          if (!conversation.permissions.read)
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
          setPending(false);
        }
      }}
    />
  );
}
