import type { Href } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
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
                  return (
                    <Pressable
                      onPress={() => router.push(`/chat/${item.id}` as Href)}
                      style={{
                        margin: 12,
                        padding: 18,
                        borderRadius: 16,
                        backgroundColor: 'white',
                      }}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '600' }}>
                        Yêu cầu #
                        {item.requestId.slice(0, 8)}
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          marginTop: 6,
                        }}
                      >
                        <Text>
                          {item.permissions.send
                            ? 'Có thể nhắn tin'
                            : 'Chỉ xem lịch sử'}
                        </Text>
                        {BigInt(item.lastSequence) > BigInt(read) && (
                          <Text style={{ color: '#2563EB' }}>Có tin chưa đọc</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
    </SafeAreaView>
  );
}
