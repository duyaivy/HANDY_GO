import type { ImagePickerAsset } from 'expo-image-picker';
import type { ChatMessage, MessageSendInput } from './types';
import { useIsFocused } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/use-auth-store';
import { ChatApi, chatErrorMessage } from './chat-api';
import { uploadChatMedia } from './chat-media';
import { useChat } from './use-chat';

type Outgoing = { input: MessageSendInput; pending: boolean; error?: string };
export function ChatScreen() {
  const participant = useAuthStore(state => state.isAuthenticated ? state.user?.id : null);
  return <ParticipantChatScreen key={participant || 'guest'} />;
}

function ParticipantChatScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const userId = useAuthStore(state => state.user?.id);
  const chat = useChat(id, focused && foreground);
  const [content, setContent] = useState('');
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [asset, setAsset] = useState<ImagePickerAsset | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', state =>
      setForeground(state === 'active'));
    return () => {
      mounted.current = false;
      sub.remove();
      upload.current?.abort();
    };
  }, []);

  const send = async (input: MessageSendInput) => {
    setOutgoing(old => [
      ...old.filter(
        item => item.input.clientMessageId !== input.clientMessageId,
      ),
      { input, pending: true },
    ]);
    try {
      await chat.send(input);
      if (mounted.current) {
        setOutgoing(old =>
          old.filter(
            item => item.input.clientMessageId !== input.clientMessageId,
          ),
        );
      }
    }
    catch (error) {
      if (mounted.current) {
        setOutgoing(old =>
          old.map(item =>
            item.input.clientMessageId === input.clientMessageId
              ? { ...item, pending: false, error: chatErrorMessage(error) }
              : item,
          ),
        );
      }
      void chat.detail.refetch();
    }
  };
  const submit = async () => {
    if (
      busy.current
      || !chat.detail.data?.permissions.send
      || (!content.trim() && !asset)
    ) {
      return;
    }
    busy.current = true;
    try {
      let storageKey: string | undefined;
      if (asset) {
        upload.current = new AbortController();
        setProgress(0);
        storageKey = await uploadChatMedia(
          asset,
          setProgress,
          upload.current.signal,
        );
      }
      const input: MessageSendInput = {
        conversationId: id,
        clientMessageId: Crypto.randomUUID(),
        messageType: asset
          ? asset.type === 'video'
            ? 'VIDEO'
            : 'IMAGE'
          : 'TEXT',
        ...(content.trim() ? { content } : {}),
        ...(reply ? { replyToId: reply.id } : {}),
        ...(storageKey ? { attachments: [{ storageKey }] } : {}),
      };
      setContent('');
      setReply(null);
      setAsset(null);
      chat.stopTyping();
      void send(input);
    }
    catch (error) {
      Alert.alert(
        'Chưa tải được tệp',
        error instanceof Error ? error.message : 'Vui lòng thử lại.',
      );
    }
    finally {
      setProgress(null);
      busy.current = false;
    }
  };
  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Cần quyền thư viện',
        'Cho phép truy cập ảnh và video trong cài đặt.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (!result.canceled)
      setAsset(result.assets[0]);
  };
  const openMedia = async (message: ChatMessage, attachmentId: string) => {
    try {
      // Resolve again before viewing; signed URLs are deliberately short-lived.
      const page = await ChatApi.history(id, {
        beforeSequence: String(BigInt(message.sequence) + 1n),
        limit: 1,
      });
      const attachment = page.items
        .find(item => item.id === message.id)
        ?.attachments
        .find(item => item.id === attachmentId);
      if (!attachment)
        throw new Error('Unavailable');
      if (attachment.mediaType === 'VIDEO')
        await Linking.openURL(attachment.url);
      else setPhoto(attachment.url);
    }
    catch {
      Alert.alert('Không mở được tệp', 'Vui lòng tải lại lịch sử rồi thử lại.');
    }
  };
  if (!userId) {
    return (
      <SafeAreaView>
        <Text>Vui lòng đăng nhập để xem cuộc trò chuyện.</Text>
      </SafeAreaView>
    );
  }
  const messages = chat.history.data?.items ?? [];
  const failed = outgoing.filter(
    item =>
      !messages.some(
        message =>
          message.senderId === userId
          && message.clientMessageId === item.input.clientMessageId,
      ),
  );
  const canSend = chat.detail.data?.permissions.send === true;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#F5F7FA' }}
      edges={['bottom']}
    >
      <Stack.Screen
        options={{
          title: params.name || 'Trò chuyện dịch vụ',
          headerShown: true,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={{ padding: 12, backgroundColor: 'white' }}>
          <Text style={{ color: '#64748B', fontSize: 12 }}>
            Yêu cầu #
            {chat.detail.data?.requestId.slice(0, 8) || '…'}
            {' '}
            ·
            {chat.connected ? 'Đã kết nối' : 'Đang kết nối lại…'}
          </Text>
          {!canSend && chat.detail.data && (
            <Text style={{ color: '#92400E', paddingTop: 6 }}>
              Chỉ xem lịch sử: báo giá hoặc đơn hàng không còn cho phép nhắn
              tin.
            </Text>
          )}
          {(chat.detail.isError || chat.history.isError || chat.syncError) && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void chat.detail.refetch();
                void chat.history.refetch();
              }}
            >
              <Text style={{ color: '#B91C1C' }}>
                Không tải được trò chuyện. Chạm để thử lại.
              </Text>
            </Pressable>
          )}
        </View>
        {chat.history.isPending
          ? (
              <ActivityIndicator style={{ flex: 1 }} />
            )
          : (
              <FlatList
                inverted
                data={[...messages].reverse()}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 14 }}
                onEndReachedThreshold={0.2}
                onEndReached={() => {
                  if (!olderBusy && chat.history.data?.before) {
                    setOlderBusy(true);
                    void chat
                      .older()
                      .catch(() =>
                        Alert.alert('Không tải được tin cũ', 'Vui lòng thử lại.'),
                      )
                      .finally(() => setOlderBusy(false));
                  }
                }}
                ListEmptyComponent={(
                  <Text
                    style={{
                      textAlign: 'center',
                      padding: 24,
                      transform: [{ scaleY: -1 }],
                    }}
                  >
                    Hãy bắt đầu trao đổi về yêu cầu dịch vụ.
                  </Text>
                )}
                ListFooterComponent={olderBusy ? <ActivityIndicator /> : null}
                ListHeaderComponent={(
                  <View>
                    {failed.map(item => (
                      <Pressable
                        key={item.input.clientMessageId}
                        disabled={item.pending}
                        onPress={() => {
                          void send(item.input);
                        }}
                        style={{
                          alignSelf: 'flex-end',
                          maxWidth: '85%',
                          marginBottom: 10,
                          padding: 12,
                          borderRadius: 16,
                          backgroundColor: '#DBEAFE',
                        }}
                      >
                        <Text>
                          {item.input.content
                            || (item.input.messageType === 'VIDEO' ? 'Video' : 'Ảnh')}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: item.error ? '#B91C1C' : '#64748B',
                          }}
                        >
                          {item.pending
                            ? 'Đang gửi…'
                            : `${item.error} Chạm để gửi lại.`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                renderItem={({ item }) => {
                  const mine = item.senderId === userId;
                  const peerRead
                    = chat.detail.data?.readStates.find(
                      state => state.userId !== userId,
                    )?.lastReadSequence || '0';
                  return (
                    <Pressable
                      accessibilityHint="Nhấn giữ để trả lời"
                      onLongPress={() => {
                        if (canSend)
                          setReply(item);
                      }}
                      style={{
                        alignSelf: mine ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        backgroundColor: mine ? '#DBEAFE' : 'white',
                        padding: 12,
                        borderRadius: 16,
                        marginBottom: 10,
                      }}
                    >
                      {item.reply && (
                        <View
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: '#2563EB',
                            paddingLeft: 8,
                            marginBottom: 6,
                          }}
                        >
                          <Text
                            numberOfLines={2}
                            style={{ color: '#64748B', fontSize: 12 }}
                          >
                            {item.reply.unavailable
                              ? 'Tin nhắn không còn khả dụng'
                              : item.reply.content
                                || (item.reply.messageType === 'VIDEO'
                                  ? 'Video'
                                  : 'Ảnh')}
                          </Text>
                        </View>
                      )}
                      {item.content && (
                        <Text style={{ color: '#0F172A', fontSize: 15 }}>
                          {item.content}
                        </Text>
                      )}
                      {item.attachments.map(attachment => (
                        <Pressable
                          key={attachment.id}
                          accessibilityRole="button"
                          accessibilityLabel={
                            attachment.mediaType === 'VIDEO'
                              ? 'Xem video'
                              : 'Xem ảnh'
                          }
                          onPress={() => {
                            void openMedia(item, attachment.id);
                          }}
                        >
                          {attachment.mediaType === 'IMAGE'
                            ? (
                                <Image
                                  source={attachment.url}
                                  style={{
                                    width: 220,
                                    height: 160,
                                    borderRadius: 10,
                                    marginVertical: 6,
                                  }}
                                  cachePolicy="none"
                                />
                              )
                            : (
                                <Text style={{ paddingVertical: 20, color: '#2563EB' }}>
                                  ▶ Xem video
                                </Text>
                              )}
                        </Pressable>
                      ))}
                      <Text
                        style={{ fontSize: 10, color: '#64748B', marginTop: 5 }}
                      >
                        {new Date(item.createdAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {mine
                          ? BigInt(peerRead) >= BigInt(item.sequence)
                            ? ' · Đã đọc'
                            : ' · Đã gửi'
                          : ''}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}
        {chat.typing && (
          <Text
            style={{ paddingHorizontal: 16, color: '#64748B', fontSize: 12 }}
          >
            Đang nhập...
          </Text>
        )}
        {reply && (
          <View
            style={{
              padding: 12,
              backgroundColor: '#EFF6FF',
              flexDirection: 'row',
            }}
          >
            <Text style={{ flex: 1 }} numberOfLines={2}>
              Trả lời:
              {reply.content
                || (reply.messageType === 'VIDEO' ? 'Video' : 'Ảnh')}
            </Text>
            <Pressable
              accessibilityLabel="Hủy trả lời"
              onPress={() => setReply(null)}
            >
              <Text>✕</Text>
            </Pressable>
          </View>
        )}
        {asset && (
          <View
            style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}
          >
            {asset.type !== 'video' && (
              <Image
                source={asset.uri}
                style={{ width: 50, height: 50, marginRight: 10 }}
              />
            )}
            <Text style={{ flex: 1 }}>
              {asset.type === 'video' ? 'Video' : 'Ảnh'}
              {' '}
              ·
              {' '}
              {progress === null ? 'Sẵn sàng tải lên' : `Đang tải ${progress}%`}
            </Text>
            <Pressable
              disabled={progress !== null}
              onPress={() => setAsset(null)}
            >
              <Text>Hủy</Text>
            </Pressable>
          </View>
        )}
        <View
          style={{
            padding: 10,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
            backgroundColor: 'white',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đính kèm ảnh hoặc video"
            disabled={!canSend || progress !== null}
            onPress={() => {
              void pick();
            }}
          >
            <Text style={{ fontSize: 25, color: '#2563EB' }}>＋</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="Nội dung tin nhắn"
            placeholder={canSend ? 'Nhắn về dịch vụ…' : 'Chỉ xem lịch sử'}
            value={content}
            onChangeText={(text) => {
              setContent(text);
              chat.type();
            }}
            editable={canSend && progress === null}
            multiline
            maxLength={4000}
            style={{
              flex: 1,
              maxHeight: 110,
              backgroundColor: '#F1F5F9',
              borderRadius: 20,
              padding: 12,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn"
            disabled={
              !canSend
              || !chat.connected
              || progress !== null
              || (!content.trim() && !asset)
            }
            onPress={() => {
              void submit();
            }}
          >
            <Text
              style={{
                color: canSend && chat.connected ? '#2563EB' : '#94A3B8',
                fontWeight: '700',
              }}
            >
              Gửi
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={Boolean(photo)}
        transparent
        onRequestClose={() => setPhoto(null)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}
        >
          <Image
            source={photo}
            style={{ flex: 1 }}
            contentFit="contain"
            cachePolicy="none"
          />
          <Pressable
            accessibilityLabel="Đóng ảnh"
            onPress={() => setPhoto(null)}
            style={{ padding: 30 }}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>Đóng</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
