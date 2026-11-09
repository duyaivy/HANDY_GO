import type { Href } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/use-auth-store';
import { ChatApi } from './chat-api';

const AVATAR_PALETTES = [
  { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' }, // Blue
  { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' }, // Amber
  { bg: '#DCFCE7', text: '#166534', border: '#BBF7D0' }, // Green
  { bg: '#F3E8FF', text: '#6B21A8', border: '#E9D5FF' }, // Purple
  { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' }, // Pink
  { bg: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' }, // Indigo
  { bg: '#CCFBF1', text: '#115E59', border: '#99F6E4' }, // Teal
];

function getAvatarPalette(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0)
    return '?';
  if (parts.length === 1)
    return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatConversationTime(dateString?: string | null): string {
  if (!dateString)
    return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime()))
    return '';
  const now = new Date();
  const isToday
    = date.getDate() === now.getDate()
      && date.getMonth() === now.getMonth()
      && date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday
    = date.getDate() === yesterday.getDate()
      && date.getMonth() === yesterday.getMonth()
      && date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Hôm qua';
  }

  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function ConversationListScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const router = useRouter();
  const list = useInfiniteQuery({
    queryKey: ['chat', userId, 'list'],
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => ChatApi.list(pageParam),
    getNextPageParam: page => page.nextCursor || undefined,
  });
  const conversations = [
    ...new Map(
      list.data?.pages
        .flatMap(page => page.items)
        .map(item => [item.id, item]),
    ).values(),
  ].filter(item => !requestId || item.requestId === requestId);
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      <Stack.Screen
        options={{ title: 'Trò chuyện theo yêu cầu', headerShown: true }}
      />
      {!userId
        ? (
            <Text>Vui lòng đăng nhập để xem trò chuyện.</Text>
          )
        : list.isPending
          ? (
              <ActivityIndicator />
            )
          : (
              <FlatList
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
                data={conversations}
                keyExtractor={item => item.id}
                refreshing={list.isRefetching}
                onRefresh={() => {
                  void list.refetch();
                }}
                onEndReached={() => {
                  if (list.hasNextPage && !list.isFetchingNextPage)
                    void list.fetchNextPage();
                }}
                ListEmptyComponent={(
                  <Text style={{ padding: 24 }}>
                    Chưa có cuộc trò chuyện cho yêu cầu dịch vụ.
                  </Text>
                )}
                ListHeaderComponent={
                  list.isError
                    ? (
                        <Text style={{ padding: 16 }}>
                          Không tải được danh sách. Kéo xuống để thử lại.
                        </Text>
                      )
                    : null
                }
                renderItem={({ item }) => {
                  const read
                    = item.readStates.find(state => state.userId === userId)
                      ?.lastReadSequence || '0';
                  const isCustomer = item.customerId === userId;
                  const name = (isCustomer ? item.workerName : item.customerName)?.trim()
                    || (isCustomer ? 'Thợ dịch vụ' : 'Khách hàng');
                  const avatarUrl = isCustomer ? item.workerAvatarUrl : item.customerAvatarUrl;
                  const service = item.serviceName?.trim() || 'Yêu cầu dịch vụ';
                  const disabled = !item.permissions.send;
                  const unreadDiff = BigInt(item.lastSequence || '0') - BigInt(read);
                  const unreadCount = unreadDiff > 0n ? Number(unreadDiff) : 0;
                  const hasUnread = unreadCount > 0;
                  const initials = getInitials(name);
                  const palette = getAvatarPalette(item.id || name);
                  const timeText = formatConversationTime(item.lastMessageAt || item.updatedAt);

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${name}, ${service}`}
                      accessibilityHint={hasUnread ? `${unreadCount} tin nhắn chưa đọc` : undefined}
                      accessibilityState={{ disabled }}
                      disabled={disabled}
                      onPress={disabled ? undefined : () => router.push(`/chat/${item.id}?name=${encodeURIComponent(name)}` as Href)}
                      style={{
                        marginHorizontal: 16,
                        marginVertical: 6,
                        padding: 14,
                        borderRadius: 16,
                        backgroundColor: disabled ? '#F3F4F6' : 'white',
                        opacity: disabled ? 0.65 : 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        shadowColor: '#0F172A',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: hasUnread ? 0.08 : 0.04,
                        shadowRadius: 6,
                        elevation: hasUnread ? 2 : 1,
                        borderWidth: 1,
                        borderColor: hasUnread ? '#BFDBFE' : '#E2E8F0',
                      }}
                    >
                      {/* Avatar */}
                      <View style={{ position: 'relative', marginRight: 14 }}>
                        {avatarUrl
                          ? (
                              <Image
                                testID={`conversation-avatar-${item.id}`}
                                source={{ uri: avatarUrl }}
                                style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#E2E8F0' }}
                                contentFit="cover"
                              />
                            )
                          : (
                              <View
                                testID={`conversation-avatar-fallback-${item.id}`}
                                style={{
                                  width: 50,
                                  height: 50,
                                  borderRadius: 25,
                                  backgroundColor: palette.bg,
                                  borderWidth: 1.5,
                                  borderColor: palette.border,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text style={{ fontSize: 17, fontWeight: '700', color: palette.text }}>
                                  {initials}
                                </Text>
                              </View>
                            )}
                        {item.permissions.send && (
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              width: 14,
                              height: 14,
                              borderRadius: 7,
                              backgroundColor: '#16A34A',
                              borderWidth: 2,
                              borderColor: 'white',
                            }}
                          />
                        )}
                      </View>

                      {/* Content */}
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        {/* Row 1: Name and Timestamp */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 16,
                              fontWeight: hasUnread ? '700' : '600',
                              color: '#0F172A',
                              flex: 1,
                              marginRight: 8,
                            }}
                          >
                            {name}
                          </Text>
                          {Boolean(timeText) && (
                            <Text style={{ fontSize: 11, color: hasUnread ? '#2563EB' : '#94A3B8', fontWeight: hasUnread ? '600' : '400' }}>
                              {timeText}
                            </Text>
                          )}
                        </View>

                        {/* Row 2: Service Tag */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <View
                            style={{
                              backgroundColor: '#EFF6FF',
                              borderRadius: 6,
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                            }}
                          >
                            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '500', color: '#2563EB' }}>
                              {service}
                            </Text>
                          </View>
                        </View>

                        {/* Row 3: Status / Snippet and Unread Notification Badge */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              fontSize: 13,
                              color: hasUnread ? '#1E40AF' : '#64748B',
                              fontWeight: hasUnread ? '600' : '400',
                              flex: 1,
                              marginRight: 8,
                            }}
                          >
                            {hasUnread
                              ? 'Có tin chưa đọc'
                              : item.permissions.send
                                ? 'Có thể nhắn tin'
                                : 'Chưa thể nhắn tin'}
                          </Text>
                          {hasUnread && (
                            <View
                              testID={`conversation-unread-badge-${item.id}`}
                              style={{
                                backgroundColor: '#EF4444',
                                minWidth: 20,
                                height: 20,
                                borderRadius: 10,
                                paddingHorizontal: 6,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
    </SafeAreaView>
  );
}
