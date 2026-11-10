import type { WorkerProfileData } from '@/services/auth/auth-api';
import * as ImagePicker from 'expo-image-picker';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import {
  CheckCircleIcon,
  ClockIcon,
  EditIcon,
  MailIcon,
  PhoneIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { queryClient } from '@/lib/api/query-client';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { ChangeEmailModal } from './change-email-modal';
import { EditProfileModal } from './edit-profile-modal';

export type ProfileDetailHeaderCardProps = {
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  phone?: string | null;
  email?: string | null;
  accountStatus?: string | null;
  workerStatus?: string | null;
  workerProfile?: WorkerProfileData | null;
  createdAt?: string | null;
  onStartVerification?: () => void;
  onProfileUpdated?: () => void;
};

const workerStatusLabels: Record<string, string> = {
  draft: 'Chưa xác minh',
  pending_kyc: 'Đang chờ xác minh',
  pending: 'Đang chờ xác minh',
  under_review: 'Đang chờ xác minh',
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

function formatDate(dateStr?: string | null): string {
  if (!dateStr) {
    return '';
  }
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  catch {
    return '';
  }
}

function ProfileInfoRow({
  label,
  value,
  testID,
  editable = false,
  icon,
  iconColor = '#2563EB',
  onPressEdit,
}: {
  label: string;
  value?: string | null;
  testID: string;
  editable?: boolean;
  icon?: 'phone' | 'email' | 'status' | 'clock' | 'verified';
  iconColor?: string;
  onPressEdit?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-neutral-100 py-2 last:border-b-0 dark:border-neutral-800">
      {icon && (
        <View
          accessible
          accessibilityLabel={label}
          className={`size-8 items-center justify-center rounded-xl ${
            icon === 'status' || icon === 'verified'
              ? 'bg-emerald-50 dark:bg-emerald-950/50'
              : 'bg-blue-50 dark:bg-blue-950/50'
          }`}
        >
          {icon === 'phone'
            ? <PhoneIcon color="#2563EB" size={17} />
            : icon === 'email'
              ? <MailIcon color="#2563EB" size={17} />
              : icon === 'clock'
                ? <ClockIcon color="#2563EB" size={17} />
                : icon === 'verified'
                  ? <CheckCircleIcon color="#059669" size={17} />
                  : <ShieldCheckIcon color={iconColor} size={17} />}
        </View>
      )}
      <View className="flex-1 justify-center">
        <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </Text>
        <Text
          testID={testID}
          className="text-sm font-semibold text-neutral-900 dark:text-white"
        >
          {value || 'Chưa cập nhật'}
        </Text>
      </View>
      {editable && (
        <Pressable
          testID={`${testID}-edit`}
          accessibilityRole="button"
          accessibilityLabel={`Chỉnh sửa ${label.toLowerCase()}`}
          onPress={onPressEdit}
          className="size-8 items-center justify-center rounded-lg bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
        >
          <EditIcon color="#6B7280" size={15} />
        </Pressable>
      )}
    </View>
  );
}

function WorkerStatusBadge({
  isVerified,
  isPending,
  status,
  statusLabel,
}: {
  isVerified: boolean;
  isPending: boolean;
  status: string;
  statusLabel: string;
}) {
  const badgeBorderBg = isVerified
    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50'
    : isPending
      ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50'
      : status === 'rejected' || status === 'suspended'
        ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
        : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50';

  const textColor = isVerified
    ? 'text-emerald-700 dark:text-emerald-300'
    : isPending
      ? 'text-amber-700 dark:text-amber-300'
      : status === 'rejected' || status === 'suspended'
        ? 'text-red-700 dark:text-red-300'
        : 'text-blue-700 dark:text-blue-300';

  return (
    <View
      testID="profile-detail-worker-status"
      className={`mt-1 self-start rounded-full border px-2.5 py-0.5 ${badgeBorderBg}`}
    >
      <Text className={`text-[10px] font-semibold ${textColor}`}>
        {statusLabel}
      </Text>
    </View>
  );
}

export function ProfileDetailHeaderCard({
  fullName,
  avatarUrl,
  bio,
  phone,
  email,
  accountStatus,
  workerStatus,
  workerProfile,
  createdAt,
  onStartVerification,
  onProfileUpdated,
}: ProfileDetailHeaderCardProps) {
  const user = useAuthStore.use.user();
  const setUser = useAuthStore.use.setUser();

  const [isEditModalVisible, setIsEditModalVisible] = React.useState(false);
  const [isEmailModalVisible, setIsEmailModalVisible] = React.useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);

  const hasWorkerProfile = Boolean(workerStatus || workerProfile);
  const status = (workerStatus || workerProfile?.status || accountStatus || '').toLowerCase();
  const isVerified = hasWorkerProfile
    ? status === 'verified'
    : accountStatus?.toLowerCase() === 'active';
  const isPending = status === 'under_review' || status === 'pending' || status === 'pending_kyc';
  const canStartVerification = Boolean(hasWorkerProfile && (status === 'draft' || status === 'rejected'));
  const statusLabel = hasWorkerProfile
    ? (workerStatusLabels[status] || (isVerified ? 'Đã xác minh' : (isPending ? 'Đang chờ xác minh' : 'Chưa xác minh')))
    : (accountStatusLabels[accountStatus?.toLowerCase() || ''] || 'Khách hàng');
  const accountStatusKey = accountStatus?.toLowerCase() || '';
  const accountStatusLabel = accountStatusLabels[accountStatusKey] || accountStatus;

  const handlePhoneEditPress = () => {
    Alert.alert(
      'Số điện thoại bảo mật',
      'Số điện thoại gắn liền với danh tính và bảo mật đăng nhập của tài khoản. Để thay đổi, vui lòng liên hệ Bộ phận hỗ trợ khách hàng HandyGo.',
      [{ text: 'Đã hiểu', style: 'default' }],
    );
  };

  const handleUploadAvatarAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploadingAvatar(true);
    try {
      const filename = asset.fileName || 'avatar.jpg';
      const isPng = filename.toLowerCase().endsWith('.png') || asset.mimeType?.includes('png');
      const type = isPng ? 'image/png' : 'image/jpeg';

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: filename.includes('.') ? filename : `${filename}.jpg`,
        type,
      } as any);

      await AuthApi.uploadAvatar(formData);
      Alert.alert('Thành công', 'Ảnh đại diện của bạn đã được cập nhật thành công.');
      if (user?.id) {
        await queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] });
      }
      onProfileUpdated?.();
    }
    catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể tải ảnh đại diện lên máy chủ.';
      Alert.alert('Lỗi tải ảnh', Array.isArray(msg) ? msg.join(', ') : msg);
    }
    finally {
      setIsUploadingAvatar(false);
    }
  };

  const pickImageFromLibrary = async () => {
    try {
      const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert(
          'Quyền truy cập thư viện ảnh',
          'Vui lòng cấp quyền truy cập thư viện ảnh trong cài đặt thiết bị để chọn ảnh đại diện.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        await handleUploadAvatarAsset(result.assets[0]);
      }
    }
    catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể mở thư viện ảnh.');
    }
  };

  const pickImageFromCamera = async () => {
    try {
      const { status: permStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert(
          'Quyền sử dụng máy ảnh',
          'Vui lòng cấp quyền sử dụng camera trong cài đặt thiết bị để chụp ảnh đại diện mới.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        await handleUploadAvatarAsset(result.assets[0]);
      }
    }
    catch (err: any) {
      Alert.alert('Lỗi', err?.message || 'Không thể khởi động camera.');
    }
  };

  const handleAvatarEditPress = () => {
    Alert.alert(
      'Cập nhật ảnh đại diện',
      'Chọn phương thức để cập nhật hình ảnh đại diện:',
      [
        { text: 'Chụp ảnh mới', onPress: pickImageFromCamera },
        { text: 'Chọn từ thư viện', onPress: pickImageFromLibrary },
        { text: 'Hủy', style: 'cancel' },
      ],
    );
  };

  const handleProfileUpdated = () => {
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] });
    }
    onProfileUpdated?.();
  };

  const handleEmailChangeSuccess = (newEmail: string) => {
    if (user) {
      setUser({ ...user, email: newEmail });
    }
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: ['user-profile', user.id] });
    }
    onProfileUpdated?.();
  };

  const formattedCreatedAt = formatDate(createdAt);
  const formattedVerifiedAt = formatDate(workerProfile?.verifiedAt);

  return (
    <>
      <View
        testID="profile-detail-header-card"
        className="mx-4 mt-4 rounded-2xl border border-neutral-200 bg-white p-4 pb-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        {/* Top Header: Avatar + Name + Status + Edit Profile */}
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
                  <View
                    testID="profile-detail-avatar-fallback"
                    className="absolute top-0 left-0 size-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/60"
                  >
                    <UserIcon color="#2563EB" size={24} />
                  </View>
                )}

            {isUploadingAvatar && (
              <View className="absolute top-0 left-0 size-14 items-center justify-center rounded-full bg-black/40">
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}

            <Pressable
              testID="profile-detail-avatar-edit"
              accessibilityRole="button"
              accessibilityLabel="Chỉnh sửa ảnh đại diện"
              onPress={handleAvatarEditPress}
              disabled={isUploadingAvatar}
              className="absolute right-0 bottom-0 size-7 items-center justify-center rounded-full border-2 border-white bg-blue-600 active:bg-blue-700 dark:border-neutral-900"
            >
              <EditIcon color="#FFFFFF" size={12} />
            </Pressable>
          </View>

          <View className="ml-3 flex-1">
            <View className="flex-row items-center justify-between">
              <Text
                testID="profile-detail-name"
                className="flex-1 text-[16px] font-bold text-neutral-900 dark:text-white"
                numberOfLines={1}
              >
                {fullName || 'Chưa cập nhật tên'}
              </Text>
              <Pressable
                testID="profile-detail-name-edit"
                accessibilityRole="button"
                accessibilityLabel="Chỉnh sửa thông tin cá nhân"
                onPress={() => setIsEditModalVisible(true)}
                className="size-7 items-center justify-center rounded-lg bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
              >
                <EditIcon color="#6B7280" size={14} />
              </Pressable>
            </View>

            <WorkerStatusBadge
              isVerified={isVerified}
              isPending={isPending}
              status={status}
              statusLabel={statusLabel}
            />
          </View>
        </View>

        {/* Bio Section */}
        <View className="mt-3 rounded-xl border border-neutral-100 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
              Tiểu sử / Giới thiệu
            </Text>
            <Pressable
              testID="profile-detail-bio-edit"
              onPress={() => setIsEditModalVisible(true)}
              className="flex-row items-center gap-1"
            >
              <EditIcon color="#2563EB" size={12} />
              <Text className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                {bio ? 'Sửa' : '+ Thêm'}
              </Text>
            </Pressable>
          </View>
          <Text
            testID="profile-detail-bio"
            className={`mt-1 text-xs/relaxed ${
              bio ? 'text-neutral-800 dark:text-neutral-200' : 'text-neutral-400 italic dark:text-neutral-500'
            }`}
          >
            {bio || 'Chưa có tiểu sử giới thiệu. Nhấn "+ Thêm" để cập nhật thông tin cá nhân.'}
          </Text>
        </View>

        {/* Contact & Account Info Rows */}
        <View className="mt-3 border-t border-neutral-100 pt-1 dark:border-neutral-800">
          <ProfileInfoRow
            label="Số điện thoại"
            value={phone}
            testID="profile-detail-phone"
            editable
            icon="phone"
            onPressEdit={handlePhoneEditPress}
          />
          <ProfileInfoRow
            label="Email"
            value={email}
            testID="profile-detail-email"
            editable
            icon="email"
            onPressEdit={() => setIsEmailModalVisible(true)}
          />
          <ProfileInfoRow
            label="Trạng thái tài khoản"
            value={accountStatusLabel}
            testID="profile-detail-account-status-value"
            icon="status"
            iconColor={
              accountStatusKey === 'active'
                ? '#059669'
                : accountStatusKey === 'pending'
                  ? '#D97706'
                  : '#DC2626'
            }
          />
          {(formattedCreatedAt || formattedVerifiedAt) && (
            <View className="flex-row items-center border-b border-neutral-100 py-2 last:border-b-0 dark:border-neutral-800">
              {formattedCreatedAt && (
                <View className="flex-1 flex-row items-center gap-2.5">
                  <View
                    accessible
                    accessibilityLabel="Ngày tham gia"
                    className="size-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50"
                  >
                    <ClockIcon color="#2563EB" size={17} />
                  </View>
                  <View className="flex-1 justify-center">
                    <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      Ngày tham gia
                    </Text>
                    <Text
                      testID="profile-detail-created-at"
                      className="text-sm font-semibold text-neutral-900 dark:text-white"
                    >
                      {formattedCreatedAt}
                    </Text>
                  </View>
                </View>
              )}

              {formattedCreatedAt && formattedVerifiedAt && (
                <View className="mx-2 h-7 w-px bg-neutral-200 dark:bg-neutral-800" />
              )}

              {formattedVerifiedAt && (
                <View className="flex-1 flex-row items-center gap-2.5">
                  <View
                    accessible
                    accessibilityLabel="Ngày xác minh"
                    className="size-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/50"
                  >
                    <CheckCircleIcon color="#059669" size={17} />
                  </View>
                  <View className="flex-1 justify-center">
                    <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      Ngày xác minh
                    </Text>
                    <Text
                      testID="profile-detail-verified-at"
                      className="text-sm font-semibold text-neutral-900 dark:text-white"
                    >
                      {formattedVerifiedAt}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {isPending && (
          <View className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/40">
            <ShieldCheckIcon color="#D97706" size={16} />
            <Text className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              Hồ sơ đang chờ xác minh
            </Text>
          </View>
        )}

        {canStartVerification && !isPending && (
          <Button
            testID="profile-detail-start-verification"
            accessibilityLabel="Xác minh tài khoản"
            variant="destructive"
            size="lg"
            className="mt-3 h-10 w-[200px] self-center rounded-xl bg-red-600 px-4 shadow-md shadow-red-600/30 active:bg-red-700 dark:bg-red-600"
            onPress={onStartVerification}
          >
            <View className="w-full flex-row items-center justify-center">
              <Text className="text-base font-semibold text-white">Xác minh tài khoản</Text>
            </View>
          </Button>
        )}
      </View>

      {/* Edit Profile Modal (Name & Bio) */}
      <EditProfileModal
        visible={isEditModalVisible}
        initialFullName={fullName}
        initialBio={bio}
        onClose={() => setIsEditModalVisible(false)}
        onSuccess={handleProfileUpdated}
      />

      {/* Change Email Modal (OTP Verification) */}
      <ChangeEmailModal
        visible={isEmailModalVisible}
        currentEmail={email}
        onClose={() => setIsEmailModalVisible(false)}
        onSuccess={handleEmailChangeSuccess}
      />
    </>
  );
}
