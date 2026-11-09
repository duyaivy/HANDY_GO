import { useEffect } from 'react';
import { AppState } from 'react-native';
import { queryClient } from '@/lib/api/query-client';
import { useAuthStore } from '@/stores/use-auth-store';
import { chatSocket } from './chat-socket';

export function ChatLifecycle() {
  const userId = useAuthStore(state =>
    state.isAuthenticated ? state.user?.id : null,
  );
  useEffect(() => {
    if (!userId) {
      chatSocket.clear();
      return;
    }
    const invalidateInbox = () => {
      void queryClient.invalidateQueries({ queryKey: ['chat', userId, 'list'] });
    };
    const unsubscribeMessage = chatSocket.subscribe('message.new', invalidateInbox);
    const unsubscribeRead = chatSocket.subscribe('message.read.updated', invalidateInbox);
    const unsubscribeConnection = chatSocket.onConnection(() => {
      if (chatSocket.connected())
        invalidateInbox();
    });
    if (chatSocket.connected())
      invalidateInbox();
    if (AppState.currentState === 'active')
      chatSocket.start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        chatSocket.start();
      else chatSocket.stop();
    });
    return () => {
      unsubscribeMessage();
      unsubscribeRead();
      unsubscribeConnection();
      subscription.remove();
      chatSocket.clear();
      void queryClient.cancelQueries({ queryKey: ['chat', userId] });
      queryClient.removeQueries({ queryKey: ['chat', userId] });
    };
  }, [userId]);
  return null;
}
