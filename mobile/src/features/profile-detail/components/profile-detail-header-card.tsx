import { Alert, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { EditIcon, MailIcon, PhoneIcon, ShieldCheckIcon, UserIcon } from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';

export type ProfileDetailHeaderCardProps = {
  fullName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  accountStatus?: string | null;
  workerStatus?: string | null;
  onStartVerification?: () => void;
};

const workerStatusLabels: Record<string, string> = {
  draft: 'Chưa xác minh',
  pending_kyc: 'Chờ gửi KYC',
  under_review: 'Đang xét duyệt',
  verified: 'Đã xác minh',
  rejected: 'Bị từ chối',
  suspended: 'Tạm khóa',
};

const accountStatusLabels: Record<string, string> = {
  active: 'Đang hoạt động',
  pending: 'Chờ xác thực',
  suspended: 'Đã tạm khóa',
  deleted: 'Đã ngừng hoạt động',
};

function showEditUnavailable(field: string) {
  Alert.alert('Tính năng chưa phát triển', `Chức năng cập nhật ${field} hiện chưa được hỗ trợ.`);
}

function ProfileInfoRow({
  label,
  value,
  testID,
  editable = false,
  icon,
  iconColor = '#2563EB',
}: {
  label: string;
  value?: string | null;
  testID: string;
  editable?: boolean;
  icon?: 'phone' | 'email' | 'status';
  iconColor?: string;
}) {
  return (
    <View className="flex-row items-center gap-2.5 border-b border-neutral-100 py-1.5 last:border-b-0 dark:border-neutral-800">
      {icon
        ? (
            <View
              accessible
              accessibilityLabel={label}
              className={`size-8 items-center justify-center rounded-xl ${icon === 'status' ? 'bg-emerald-50 dark:bg-emerald-950/50' : 'bg-blue-50 dark:bg-blue-950/50'}`}
            >
              {icon === 'phone'
                ? <PhoneIcon color="#2563EB" size={17} />
                : icon === 'email'
                  ? <MailIcon color="#2563EB" size={17} />
                  : <ShieldCheckIcon color={iconColor} size={17} />}
            </View>
          )
        : (
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">{label}</Text>
          )}
      <View className="flex-1 flex-row items-center justify-end gap-2">
        <Text testID={testID} className={`flex-1 text-sm font-medium text-neutral-900 dark:text-white ${icon ? 'text-left' : 'text-right'}`}>
          {value || 'Chưa cập nhật'}
        </Text>
        {editable && (
          <Pressable
            testID={`${testID}-edit`}
            accessibilityRole="button"
            accessibilityLabel={`Chỉnh sửa ${label.toLowerCase()}`}
            onPress={() => showEditUnavailable(label.toLowerCase())}
            className="size-8 items-center justify-center rounded-lg bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
          >
            <EditIcon color="#6B7280" size={15} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function ProfileDetailHeaderCard({
  fullName,
  avatarUrl,
  phone,
  email,
  accountStatus,
  workerStatus,
  onStartVerification,
}: ProfileDetailHeaderCardProps) {
  const status = workerStatus?.toLowerCase() || '';
  const isVerified = status === 'verified';
  const canStartVerification = status === 'draft' || status === 'pending_kyc';
  const statusLabel = workerStatusLabels[status] || 'Chưa có hồ sơ thợ';
  const accountStatusKey = accountStatus?.toLowerCase() || '';
  const accountStatusLabel = accountStatusLabels[accountStatusKey] || accountStatus;

  return (
    <View testID="profile-detail-header-card" className="rounded-2xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center">
        <View className="relative size-[64px] shrink-0">
          {avatarUrl
            ? (
                <Image
                  testID="profile-detail-avatar"
                  source={{ uri: avatarUrl }}
                  className="absolute top-0 left-0 size-14 rounded-full border-2 border-white dark:border-neutral-700"
                />
              )
            : (
                <View testID="profile-detail-avatar-fallback" className="absolute top-0 left-0 size-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/60">
                  <UserIcon color="#2563EB" size={24} />
                </View>
              )}
          <Pressable
            testID="profile-detail-avatar-edit"
            accessibilityRole="button"
            accessibilityLabel="Chỉnh sửa ảnh đại diện"
            onPress={() => showEditUnavailable('ảnh đại diện')}
            className="absolute right-0 bottom-0 size-7 items-center justify-center rounded-full border-2 border-white bg-blue-600 dark:border-neutral-900"
          >
            <EditIcon color="#FFFFFF" size={12} />
          </Pressable>
        </View>
        <View className="ml-3 flex-1">
          <Text testID="profile-detail-name" className="text-[16px] font-bold text-neutral-900 dark:text-white">
            {fullName || 'Chưa cập nhật tên'}
          </Text>
          <View
            testID="profile-detail-worker-status"
            className={`mt-1 self-start rounded-full border px-2.5 py-0.5 ${
              isVerified
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50'
                : status === 'under_review' || status === 'pending_kyc'
                  ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50'
                  : status === 'rejected' || status === 'suspended'
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
                    : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50'
            }`}
          >
            <Text className={`text-[10px] font-semibold ${
              isVerified
                ? 'text-emerald-700 dark:text-emerald-300'
                : status === 'under_review' || status === 'pending_kyc'
                  ? 'text-blue-700 dark:text-blue-300'
                  : status === 'rejected' || status === 'suspended'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-amber-700 dark:text-amber-300'
            }`}
            >
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-1.5 border-t border-neutral-100 pt-1 dark:border-neutral-800">
        <ProfileInfoRow label="Số điện thoại" value={phone} testID="profile-detail-phone" editable icon="phone" />
        <ProfileInfoRow label="Email" value={email} testID="profile-detail-email" editable icon="email" />
        <ProfileInfoRow
          label="Trạng thái tài khoản"
          value={accountStatusLabel}
          testID="profile-detail-account-status-value"
          icon="status"
          iconColor={accountStatusKey === 'active' ? '#059669' : accountStatusKey === 'pending' ? '#D97706' : '#DC2626'}
        />
      </View>

      {canStartVerification && (
        <Button
          testID="profile-detail-start-verification"
          accessibilityLabel="Xác thực tài khoản"
          variant="destructive"
          size="lg"
          className="mt-2.5 h-10 w-[200px] self-center rounded-xl bg-red-600 px-4 shadow-md shadow-red-600/30 active:bg-red-700 dark:bg-red-600"
          onPress={onStartVerification}
        >
          <View className="w-full flex-row items-center justify-center">
            <Text className="text-base font-semibold text-white">Xác thực tài khoản</Text>
          </View>
        </Button>
      )}
    </View>
  );
}
