import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/ui/button';
import { CloseIcon, UserIcon } from '@/components/ui/icons/handy-icons';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { AuthApi } from '@/services/auth/auth-api';

export type EditProfileModalProps = {
  visible: boolean;
  initialFullName?: string | null;
  initialBio?: string | null;
  onClose: () => void;
  onSuccess: (updated: { fullName: string; bio: string }) => void;
};

function EditProfileForm({
  initialFullName = '',
  initialBio = '',
  onClose,
  onSuccess,
}: Omit<EditProfileModalProps, 'visible'>) {
  const [fullName, setFullName] = React.useState(initialFullName || '');
  const [bio, setBio] = React.useState(initialBio || '');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSave = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage('Họ và tên phải có ít nhất 2 ký tự');
      return;
    }
    if (trimmedName.length > 150) {
      setErrorMessage('Họ và tên không được vượt quá 150 ký tự');
      return;
    }
    if (bio.length > 500) {
      setErrorMessage('Tiểu sử không được vượt quá 500 ký tự');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await AuthApi.updateProfile({
        fullName: trimmedName,
        bio: bio.trim(),
      });

      Alert.alert('Thành công', 'Thông tin cá nhân đã được cập nhật.');
      onSuccess({ fullName: trimmedName, bio: bio.trim() });
      onClose();
    }
    catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể cập nhật thông tin. Vui lòng thử lại.';
      setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <View
      testID="edit-profile-modal"
      className="max-h-[85%] overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-neutral-900"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <View className="flex-row items-center gap-2.5">
          <View className="size-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60">
            <UserIcon color="#2563EB" size={18} />
          </View>
          <Text className="text-base font-bold text-neutral-900 dark:text-white">
            Chỉnh sửa thông tin
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng"
          testID="edit-profile-close-btn"
          onPress={onClose}
          disabled={isLoading}
          className="size-8 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
        >
          <CloseIcon color="#6B7280" size={18} />
        </Pressable>
      </View>

      {/* Form Content */}
      <ScrollView className="p-5" keyboardShouldPersistTaps="handled">
        {errorMessage && (
          <View
            testID="edit-profile-error"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/40"
          >
            <Text className="text-xs font-medium text-red-700 dark:text-red-300">
              {errorMessage}
            </Text>
          </View>
        )}

        <View className="mb-4">
          <Text className="mb-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
            Họ và tên
            {' '}
            <Text className="text-red-500">*</Text>
          </Text>
          <Input
            testID="edit-profile-name-input"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Nhập họ và tên đầy đủ"
            maxLength={150}
            editable={!isLoading}
            autoCapitalize="words"
          />
        </View>

        <View className="mb-2">
          <View className="mb-1.5 flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Tiểu sử / Giới thiệu
            </Text>
            <Text className="text-[11px] text-neutral-400">
              {bio.length}
              /500
            </Text>
          </View>
          <TextInput
            testID="edit-profile-bio-input"
            value={bio}
            onChangeText={setBio}
            placeholder="Giới thiệu đôi nét về bản thân hoặc kinh nghiệm..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            maxLength={500}
            editable={!isLoading}
            textAlignVertical="top"
            className="min-h-[100px] rounded-xl border border-neutral-300 bg-neutral-100 p-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </View>
      </ScrollView>

      {/* Actions */}
      <View className="flex-row items-center justify-end gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800">
        <Button
          testID="edit-profile-cancel-btn"
          variant="outline"
          size="sm"
          label="Hủy"
          disabled={isLoading}
          onPress={onClose}
          className="min-w-[80px]"
        />
        <Button
          testID="edit-profile-save-btn"
          variant="default"
          size="sm"
          disabled={isLoading}
          onPress={handleSave}
          className="min-w-[120px] bg-blue-600 active:bg-blue-700"
        >
          {isLoading
            ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">Đang lưu...</Text>
                </View>
              )
            : (
                <Text className="text-sm font-semibold text-white">Lưu thay đổi</Text>
              )}
        </Button>
      </View>
    </View>
  );
}

export function EditProfileModal(props: EditProfileModalProps) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center bg-black/50 px-4"
      >
        {props.visible && <EditProfileForm {...props} />}
      </KeyboardAvoidingView>
    </Modal>
  );
}
