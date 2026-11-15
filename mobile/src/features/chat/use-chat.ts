import type {
  ChatMessage,
  ChatReadState,
  MessageSendInput,
  MessageSendResult,
  TypingUpdate,
} from './types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { getSessionVersion } from '@/lib/auth/utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { ChatApi } from './chat-api';
import { chatSocket } from './chat-socket';
import { contiguousSequence, mergeMessages } from './message-cache';

export type HistoryCache = {
  items: ChatMessage[];
  before: string | null;
  contiguous: string;
};
export function useChat(conversationId: string, visible: boolean) {
  const userId = useAuthStore(s => s.user?.id);
  const queryClient = useQueryClient();
  const key = useMemo(() => ['chat', userId, conversationId, 'history'], [userId, conversationId]);
  const detailKey = useMemo(() => ['chat', userId, conversationId, 'detail'], [userId, conversationId]);
  const connected = useSyncExternalStore(useCallback(listener => chatSocket.onConnection(listener), []), chatSocket.connected, () => false);
  const [typing, setTyping] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const syncing = useRef(false);
  const lastTyping = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detail = useQuery({
    queryKey: detailKey,
    enabled: Boolean(userId && conversationId),
    queryFn: () => ChatApi.detail(conversationId),
    refetchInterval: visible ? 15000 : false,
  });
  const history = useQuery({
    queryKey: key,
    enabled: Boolean(userId && conversationId),
    queryFn: async (): Promise<HistoryCache> => {
      const page = await ChatApi.history(conversationId);
      return {
        items: page.items,
        before: page.nextBeforeSequence,
        contiguous: page.highWaterSequence,
      };
    },
    staleTime: Infinity,
  });
  const merge = useCallback((items: ChatMessage[]) => {
    queryClient.setQueryData<HistoryCache>(key, old =>
      old
        ? {
            ...old,
            items: mergeMessages(old.items, items),
            contiguous: contiguousSequence(old.contiguous, mergeMessages(old.items, items)),
          }
        : old);
    void queryClient.invalidateQueries({ queryKey: ['chat', userId, 'list'] });
  }, [key, queryClient, userId]);
  const refetchDetail = detail.refetch;
  const synchronize = async () => {
    if (syncing.current)
      return;
    const version = getSessionVersion();
    const cached = queryClient.getQueryData<HistoryCache>(key);
    if (!cached)
      return;
    syncing.current = true;
    try {
      let after = cached.contiguous;
      let stalled = 0;
      for (;;) {
        const page = await ChatApi.history(conversationId, {
          afterSequence: after,
        });
        if (getSessionVersion() !== version)
          return;
        merge(page.items);
        if (!page.nextAfterSequence) {
          const observed = queryClient.getQueryData<HistoryCache>(key);
          const newest = observed?.items.at(-1)?.sequence;
          if (observed && newest && BigInt(newest) > BigInt(observed.contiguous)) {
            stalled = observed.contiguous === after ? stalled + 1 : 0;
            if (stalled > 1)
              throw new Error('History synchronization stalled');
            after = observed.contiguous;
            continue;
          }
          break;
        }
        after = page.nextAfterSequence;
      }
      setSyncError(false);
      await detail.refetch();
    }
    catch {
      setSyncError(true);
    }
    finally {
      syncing.current = false;
    }
  };
  const syncRef = useRef(synchronize);
  syncRef.current = synchronize;
  useEffect(() => {
    if (!userId || !conversationId)
      return;
    const message = chatSocket.subscribe('message.new', (item) => {
      if (item.conversationId !== conversationId)
        return;
      merge([item]);
      const cached = queryClient.getQueryData<HistoryCache>(key);
      if (cached && BigInt(cached.contiguous) < BigInt(item.sequence))
        void syncRef.current();
    });
    const read = chatSocket.subscribe(
      'message.read.updated',
      (state: ChatReadState) => {
        if (state.conversationId === conversationId)
          void refetchDetail();
      },
    );
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const typing = chatSocket.subscribe(
      'typing.update',
      (event: TypingUpdate) => {
        if (event.conversationId !== conversationId || event.userId === userId)
          return;
        clearTimeout(expiry);
        const remaining = Math.min(
          5000,
          Date.parse(event.expiresAt) - Date.now(),
        );
        setTyping(event.isTyping && remaining > 0);
        if (event.isTyping)
          expiry = setTimeout(() => setTyping(false), Math.max(0, remaining));
      },
    );
    return () => {
      clearTimeout(expiry);
      if (idleTimer.current)
        clearTimeout(idleTimer.current);
      void chatSocket
        .request('typing.stop', { conversationId })
        .catch(() => {});
      void chatSocket
        .request('conversation.leave', { conversationId })
        .catch(() => {});
      message();
      read();
      typing();
    };
    // Subscriptions are scoped to the authenticated participant and route.
  }, [userId, conversationId, merge, refetchDetail, key, queryClient]);
  useEffect(() => {
    if (history.isSuccess && connected)
      void syncRef.current();
  }, [history.isSuccess, connected]);
  useEffect(() => {
    if (!connected)
      return;
    if (visible) {
      void chatSocket.request('conversation.join', { conversationId }).catch(() => {});
    }
    else {
      void chatSocket.request('typing.stop', { conversationId }).catch(() => {});
      void chatSocket.request('conversation.leave', { conversationId }).catch(() => {});
    }
  }, [visible, connected, conversationId]);
  const latest = history.data?.contiguous;
  useEffect(() => {
    if (
      !visible
      || AppState.currentState !== 'active'
      || !latest
      || latest === '0'
    ) {
      return;
    }
    void ChatApi.read(conversationId, latest)
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: ['chat', userId, 'list'],
        });
      })
      .catch(() => {});
  }, [visible, latest, conversationId, queryClient, userId]);
  return {
    detail,
    history,
    typing: visible && typing,
    connected,
    syncError,
    refresh: synchronize,
    older: async () => {
      const cached = queryClient.getQueryData<HistoryCache>(key);
      if (!cached?.before)
        return;
      const page = await ChatApi.history(conversationId, {
        beforeSequence: cached.before,
      });
      queryClient.setQueryData<HistoryCache>(key, old =>
        old
          ? {
              ...old,
              items: mergeMessages(old.items, page.items),
              before: page.nextBeforeSequence,
            }
          : old);
    },
    stopTyping: () => {
      if (idleTimer.current)
        clearTimeout(idleTimer.current);
      void chatSocket
        .request('typing.stop', { conversationId })
        .catch(() => {});
    },
    type: () => {
      if (!visible || !detail.data?.permissions.send)
        return;
      if (Date.now() - lastTyping.current > 2500) {
        lastTyping.current = Date.now();
        void chatSocket
          .request('typing.start', { conversationId })
          .catch(() => {});
      }
      if (idleTimer.current)
        clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        void chatSocket
          .request('typing.stop', { conversationId })
          .catch(() => {});
      }, 1500);
    },
    send: async (input: MessageSendInput) => {
      const version = getSessionVersion();
      const result = await chatSocket.request<MessageSendResult>(
        'message.send',
        input,
      );
      if (getSessionVersion() !== version)
        throw new Error('Session changed');
      merge([result.message]);
      return result.message;
    },
  };
}
