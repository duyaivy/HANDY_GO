import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { BellIcon } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/stores/use-auth-store';
import { useUnreadNotifications } from '../hooks/use-notifications';

export function NotificationBell() {
  const router = useRouter();
  const mode = useAuthStore(s => s.activeMode);
  const { data } = useUnreadNotifications();
  const count = data?.count ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Thông báo, ${count} chưa đọc`}
      className="relative m-2 p-2"
      onPress={() => router.push((mode === 'Worker' ? '/worker/notifications' : '/customer/(tabs)/notifications') as Href)}
    >
      <BellIcon />
      {count > 0 && (
        <View className="absolute top-0 right-0 rounded-full bg-red-500 px-1">
          <Text className="text-xs text-white">{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </Pressable>
  );
}
