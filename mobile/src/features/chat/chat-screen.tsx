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
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraIcon, CloseIcon, GalleryIcon, PlayIcon, RetryIcon, SendIcon } from '@/components/ui/icons/handy-icons';
import { Logger } from '@/services/logger/logger';
import { useAuthStore } from '@/stores/use-auth-store';
import { ChatApi, chatErrorMessage } from './chat-api';
import { uploadChatMedia } from './chat-media';
import { ChatMediaCard } from './chat-media-card';
import { useChat } from './use-chat';
import { useChatKeyboard } from './use-chat-keyboard';

type Outgoing = { input: MessageSendInput; pending: boolean; error?: string; preview?: ImagePickerAsset };
export function ChatScreen() {
  const participant = useAuthStore(state => state.isAuthenticated ? state.user?.id : null);
  return <ParticipantChatScreen key={participant || 'guest'} />;
}

function ParticipantChatScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const focused = useIsFocused();
  const keyboard = useChatKeyboard();
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

  const send = async (input: MessageSendInput, preview?: ImagePickerAsset) => {
    setOutgoing(old => [
      ...old.filter(
        item => item.input.clientMessageId !== input.clientMessageId,
      ),
      { input, pending: true, preview },
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
      void send(input, asset ?? undefined);
    }
    catch (error) {
      if (!upload.current?.signal.aborted) {
        Alert.alert(
          'Chưa tải được tệp',
          error instanceof Error ? error.message : 'Vui lòng thử lại.',
        );
      }
    }
    finally {
      setProgress(null);
      upload.current = null;
      busy.current = false;
    }
  };
  const pick = async (source: 'camera' | 'library') => {
    try {
      // Android's system Photo Picker grants access only to the selected photo/video.
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Cần quyền Camera', 'Cho phép truy cập máy ảnh trong cài đặt để chụp ảnh gửi trong cuộc trò chuyện.');
          return;
        }
      }
      else if (Platform.OS !== 'android') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Cần quyền thư viện', 'Cho phép truy cập ảnh và video trong cài đặt.');
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            quality: 0.8,
            allowsMultipleSelection: false,
            legacy: false,
          });
      if (!result.canceled && result.assets[0])
        setAsset(result.assets[0]);
    }
    catch (error) {
      Logger.warn('CHAT_MEDIA_PICKER', 'Không mở được thư viện ảnh', error instanceof Error ? error.message : 'Unknown picker error');
      Alert.alert('Không mở được thư viện ảnh', 'Vui lòng kiểm tra quyền truy cập ảnh và thử lại.');
    }
  };
  const chooseMediaSource = () => {
    Keyboard.dismiss();
    Alert.alert('Thêm ảnh hoặc video', 'Chọn cách thêm ảnh hiện trạng để trao đổi về dịch vụ:', [
      { text: 'Chụp ảnh ngay', onPress: () => { void pick('camera'); } },
      { text: 'Chọn từ thư viện ảnh', onPress: () => { void pick('library'); } },
      { text: 'Hủy', style: 'cancel' },
    ], { cancelable: true });
  };
  const resolveMedia = async (message: ChatMessage, attachmentId: string) => {
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
    return attachment;
  };
  const openMedia = async (message: ChatMessage, attachmentId: string) => {
    try {
      const attachment = await resolveMedia(message, attachmentId);
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
  const conversation = chat.detail.data;
  const peerName = userId === conversation?.customerId ? conversation?.workerName : conversation?.customerName;
  const title = peerName?.trim() || params.name || (conversation ? userId === conversation.customerId ? 'Thợ dịch vụ' : 'Khách hàng' : 'Trò chuyện dịch vụ');
  const sendDisabled = !canSend || !chat.connected || progress !== null || (!content.trim() && !asset);
  return (
    <View ref={keyboard.containerRef} onLayout={keyboard.onLayout} style={{ flex: 1 }}>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#F5F7FA' }}
        edges={Platform.OS === 'ios' && keyboard.keyboardVisible ? [] : ['bottom']}
      >
        <Stack.Screen
          options={{
            title,
            headerShown: true,
            headerTitleAlign: 'center',
            headerRight: () => (
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={chat.connected ? 'Chat đã kết nối' : 'Chat chưa kết nối'}
                style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: chat.connected ? '#16A34A' : '#94A3B8' }}
              />
            ),
          }}
        />
        <View
          testID="chat-keyboard-content"
          style={{ flex: 1, paddingBottom: keyboard.bottomInset }}
        >
          <View style={{ padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
            <Text style={{ color: '#475569', fontSize: 13, fontWeight: '500', textAlign: 'center' }}>
              {conversation?.serviceName ? `Yêu cầu ${conversation.serviceName}` : 'Trao đổi về yêu cầu dịch vụ'}
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
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
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
                        <View
                          key={item.input.clientMessageId}
                          style={{
                            alignSelf: 'flex-end',
                            maxWidth: '85%',
                            marginBottom: 10,
                            padding: item.preview ? 0 : 12,
                            borderRadius: 16,
                            backgroundColor: item.preview ? 'transparent' : '#DBEAFE',
                          }}
                        >
                          {item.preview && item.preview.type !== 'video' && (
                            <ChatMediaCard
                              attachment={{ id: item.input.clientMessageId, mediaType: 'IMAGE', url: item.preview.uri, width: item.preview.width, height: item.preview.height }}
                              onOpen={() => setPhoto(item.preview!.uri)}
                            />
                          )}
                          {item.preview?.type === 'video' && (
                            <View style={{ width: 210, minHeight: 90, borderRadius: 12, padding: 16, backgroundColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <PlayIcon size={32} />
                              <Text numberOfLines={1} style={{ color: '#1E40AF' }}>{item.preview.fileName || 'Video đã chọn'}</Text>
                            </View>
                          )}
                          {Boolean(item.input.content) && <Text>{item.input.content}</Text>}
                          <Text
                            style={{
                              fontSize: 11,
                              color: item.error ? '#B91C1C' : '#64748B',
                            }}
                          >
                            {item.pending ? 'Đang gửi…' : item.error}
                          </Text>
                          {!item.pending && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Gửi lại tin nhắn"
                              disabled={!canSend || !chat.connected}
                              onPress={() => { void send(item.input, item.preview); }}
                              style={{ minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, opacity: canSend && chat.connected ? 1 : 0.45 }}
                            >
                              <RetryIcon />
                              <Text style={{ color: '#2563EB', fontWeight: '600' }}>Gửi lại</Text>
                            </Pressable>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                  renderItem={({ item }) => {
                    const mine = item.senderId === userId;
                    const isMedia = item.attachments.length > 0;
                    const peerRead
                      = chat.detail.data?.readStates.find(
                        state => state.userId !== userId,
                      )?.lastReadSequence || '0';
                    const sentAt = new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    const delivery = mine ? BigInt(peerRead) >= BigInt(item.sequence) ? ' · Đã đọc' : ' · Đã gửi' : '';
                    return (
                      <Pressable
                        testID={isMedia ? `chat-media-message-${item.id}` : undefined}
                        accessibilityHint="Nhấn giữ để trả lời"
                        onLongPress={() => {
                          if (canSend)
                            setReply(item);
                        }}
                        style={{
                          alignSelf: mine ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          backgroundColor: isMedia ? 'transparent' : mine ? '#DBEAFE' : 'white',
                          padding: isMedia ? 0 : 12,
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
                        {item.content && !isMedia && (
                          <Text style={{ color: '#0F172A', fontSize: 15 }}>
                            {item.content}
                          </Text>
                        )}
                        {item.attachments.map((attachment, index) => (
                          <ChatMediaCard
                            key={attachment.id}
                            attachment={attachment}
                            onOpen={() => {
                              void openMedia(item, attachment.id);
                            }}
                            onRefresh={async () => (await resolveMedia(item, attachment.id)).url}
                            footer={!item.content && index === item.attachments.length - 1
                              ? (
                                  <Text
                                    testID={`chat-media-meta-${item.id}`}
                                    style={{ position: 'absolute', right: 8, bottom: 8, backgroundColor: '#0F172AB3', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, color: 'white' }}
                                  >
                                    {sentAt}
                                    {delivery}
                                  </Text>
                                )
                              : null}
                          />
                        ))}
                        {isMedia && item.content && <Text style={{ padding: 10, backgroundColor: mine ? '#DBEAFE' : 'white', borderRadius: 12, color: '#0F172A', fontSize: 15 }}>{item.content}</Text>}
                        {(!isMedia || Boolean(item.content)) && (
                          <Text style={{ fontSize: 10, color: '#64748B', marginTop: 5 }}>
                            {sentAt}
                            {delivery}
                          </Text>
                        )}
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
                style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <CloseIcon />
              </Pressable>
            </View>
          )}
          {asset && (
            <View
              style={{ padding: 14, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#E2E8F0' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 12 }}>
                {asset.type === 'video' ? 'Video đã chọn' : 'Ảnh đã chọn'}
                {' '}
                ·
                {' '}
                {progress === null ? 'Sẵn sàng gửi' : `Đang tải ${progress}%`}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={{ width: 96, height: 96 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={asset.type === 'video' ? 'Video đã chọn' : 'Xem trước ảnh đã chọn'}
                    onPress={() => {
                      if (asset.type !== 'video')
                        setPhoto(asset.uri);
                    }}
                    style={{ width: 96, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {asset.type === 'video' ? <PlayIcon size={32} /> : <Image source={asset.uri} style={{ width: 96, height: 96 }} contentFit="cover" />}
                    {progress !== null && (
                      <View style={{ position: 'absolute', inset: 0, backgroundColor: '#0F172A99', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: 'white', fontSize: 11 }}>
                          {progress}
                          %
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={progress !== null ? 'Hủy tải tệp' : 'Bỏ tệp đã chọn'}
                    onPress={() => {
                      if (progress !== null)
                        upload.current?.abort();
                      else setAsset(null);
                    }}
                    hitSlop={8}
                    style={{ position: 'absolute', top: -8, right: -8, width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <CloseIcon color="#FFFFFF" size={18} />
                  </Pressable>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đổi ảnh hoặc video"
                  disabled={progress !== null}
                  onPress={chooseMediaSource}
                  style={{ width: 96, height: 96, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: progress === null ? 1 : 0.4 }}
                >
                  <CameraIcon color="#2563EB" size={24} />
                  <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '600' }}>Chọn lại</Text>
                </Pressable>
              </View>
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
              accessibilityHint="Chụp ảnh hoặc chọn ảnh, video từ thư viện"
              disabled={!canSend || progress !== null}
              onPress={() => {
                chooseMediaSource();
              }}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', opacity: canSend && progress === null ? 1 : 0.4 }}
            >
              <GalleryIcon />
            </Pressable>
            <TextInput
              accessibilityLabel="Nội dung tin nhắn"
              placeholder={canSend ? asset ? 'Thêm chú thích…' : 'Nhắn về dịch vụ…' : 'Chỉ xem lịch sử'}
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
                minHeight: 48,
                maxHeight: 110,
                backgroundColor: '#F1F5F9',
                borderRadius: 20,
                padding: 12,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gửi tin nhắn"
              disabled={sendDisabled}
              onPress={() => {
                void submit();
              }}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: sendDisabled ? '#CBD5E1' : '#2563EB' }}
            >
              <SendIcon size={23} />
            </Pressable>
          </View>
        </View>
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
              style={{ position: 'absolute', top: 55, right: 20, width: 48, height: 48, borderRadius: 24, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' }}
            >
              <CloseIcon color="#FFFFFF" size={25} />
            </Pressable>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}
