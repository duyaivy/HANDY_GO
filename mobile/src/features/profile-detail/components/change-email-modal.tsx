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
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { CheckCircleIcon, CloseIcon, MailIcon } from '@/components/ui/icons/handy-icons';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { AuthApi } from '@/services/auth/auth-api';

export type ChangeEmailModalProps = {
  visible: boolean;
  currentEmail?: string | null;
  onClose: () => void;
  onSuccess: (newEmail: string) => void;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ChangeEmailForm({
  currentEmail,
  onClose,
  onSuccess,
}: Omit<ChangeEmailModalProps, 'visible'>) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [newEmail, setNewEmail] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  // Cooldown countdown timer for OTP resend
  React.useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRequestOtp = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      setErrorMessage('Vui lòng nhập địa chỉ email mới');
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setErrorMessage('Địa chỉ email không đúng định dạng');
      return;
    }
    if (currentEmail && trimmed === currentEmail.trim().toLowerCase()) {
      setErrorMessage('Email mới không được trùng với email hiện tại');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await AuthApi.requestChangeEmail({ newEmail: trimmed });
      setStep(2);
      setCooldown(response.data?.cooldownSeconds || 60);
    }
    catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể gửi mã OTP. Vui lòng thử lại.';
      setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || isLoading) {
      return;
    }
    const trimmed = newEmail.trim().toLowerCase();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await AuthApi.requestChangeEmail({ newEmail: trimmed });
      setCooldown(response.data?.cooldownSeconds || 60);
      Alert.alert('Thành công', 'Mã xác thực mới đã được gửi tới email của bạn.');
    }
    catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Không thể gửi lại mã OTP.';
      setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    finally {
      setIsLoading(false);
    }
  };

  const handleConfirmOtp = async () => {
    const trimmedOtp = otp.trim();
    if (!trimmedOtp || trimmedOtp.length !== 6) {
      setErrorMessage('Vui lòng nhập đủ 6 chữ số mã xác thực');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const trimmedEmail = newEmail.trim().toLowerCase();
      await AuthApi.confirmChangeEmail({
        newEmail: trimmedEmail,
        otp: trimmedOtp,
      });

      Alert.alert('Đổi email thành công', `Tài khoản của bạn đã được cập nhật email: ${trimmedEmail}`);
      onSuccess(trimmedEmail);
      onClose();
    }
    catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Xác thực OTP thất bại. Vui lòng thử lại.';
      setErrorMessage(Array.isArray(msg) ? msg.join(', ') : msg);
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <View
      testID="change-email-modal"
      className="max-h-[85%] overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-neutral-900"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
        <View className="flex-row items-center gap-2.5">
          {step === 2 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              testID="change-email-back-btn"
              onPress={() => {
                setStep(1);
                setErrorMessage(null);
              }}
              className="size-8 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
            >
              <ArrowLeft width={14} height={14} color="#374151" />
            </Pressable>
          )}
          <View className="size-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60">
            <MailIcon color="#2563EB" size={18} />
          </View>
          <Text className="text-base font-bold text-neutral-900 dark:text-white">
            {step === 1 ? 'Đổi địa chỉ email' : 'Xác thực mã OTP'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng"
          testID="change-email-close-btn"
          onPress={onClose}
          disabled={isLoading}
          className="size-8 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
        >
          <CloseIcon color="#6B7280" size={18} />
        </Pressable>
      </View>

      {/* Body */}
      <ScrollView className="p-5" keyboardShouldPersistTaps="handled">
        {errorMessage && (
          <View
            testID="change-email-error"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/40"
          >
            <Text className="text-xs font-medium text-red-700 dark:text-red-300">
              {errorMessage}
            </Text>
          </View>
        )}

        {step === 1
          ? (
              <View>
                {currentEmail && (
                  <View className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/60">
                    <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                      Email hiện tại:
                    </Text>
                    <Text className="mt-0.5 text-sm font-medium text-neutral-900 dark:text-white">
                      {currentEmail}
                    </Text>
                  </View>
                )}

                <Text className="mb-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                  Địa chỉ email mới
                  {' '}
                  <Text className="text-red-500">*</Text>
                </Text>
                <Input
                  testID="change-email-input"
                  value={newEmail}
                  onChangeText={setNewEmail}
                  placeholder="vidu@domain.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                />

                <Text className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Chúng tôi sẽ gửi một mã OTP 6 số đến địa chỉ email này để xác thực quyền sở hữu.
                </Text>
              </View>
            )
          : (
              <View>
                <View className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-900/50 dark:bg-blue-950/40">
                  <View className="flex-row items-center gap-2">
                    <CheckCircleIcon color="#2563EB" size={16} />
                    <Text className="text-xs font-medium text-blue-900 dark:text-blue-200">
                      Mã xác thực đã gửi tới:
                    </Text>
                  </View>
                  <Text className="mt-1 text-sm font-bold text-blue-700 dark:text-blue-300">
                    {newEmail}
                  </Text>
                </View>

                <Text className="mb-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                  Mã OTP (6 chữ số)
                  {' '}
                  <Text className="text-red-500">*</Text>
                </Text>
                <TextInput
                  testID="change-email-otp-input"
                  value={otp}
                  onChangeText={text => setOtp(text.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!isLoading}
                  className="h-14 rounded-xl border border-neutral-300 bg-neutral-100 px-4 text-center text-2xl font-bold tracking-[10px] text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />

                <View className="mt-4 flex-row items-center justify-between">
                  <Pressable
                    onPress={() => {
                      setStep(1);
                      setErrorMessage(null);
                    }}
                    disabled={isLoading}
                  >
                    <Text className="text-xs font-medium text-neutral-500 underline dark:text-neutral-400">
                      Đổi email khác
                    </Text>
                  </Pressable>

                  <Pressable
                    testID="change-email-resend-btn"
                    onPress={handleResendOtp}
                    disabled={cooldown > 0 || isLoading}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        cooldown > 0 || isLoading
                          ? 'text-neutral-400 dark:text-neutral-600'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {cooldown > 0 ? `Gửi lại mã sau (${cooldown}s)` : 'Gửi lại mã OTP'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
      </ScrollView>

      {/* Actions */}
      <View className="flex-row items-center justify-end gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800">
        <Button
          testID="change-email-cancel-btn"
          variant="outline"
          size="sm"
          label="Hủy"
          disabled={isLoading}
          onPress={onClose}
          className="min-w-[80px]"
        />
        {step === 1
          ? (
              <Button
                testID="change-email-submit-step1-btn"
                variant="default"
                size="sm"
                disabled={isLoading || !newEmail.trim()}
                onPress={handleRequestOtp}
                className="min-w-[130px] bg-blue-600 active:bg-blue-700"
              >
                {isLoading
                  ? (
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text className="text-sm font-semibold text-white">Đang gửi...</Text>
                      </View>
                    )
                  : (
                      <Text className="text-sm font-semibold text-white">Gửi mã OTP</Text>
                    )}
              </Button>
            )
          : (
              <Button
                testID="change-email-submit-step2-btn"
                variant="default"
                size="sm"
                disabled={isLoading || otp.length < 6}
                onPress={handleConfirmOtp}
                className="min-w-[140px] bg-blue-600 active:bg-blue-700"
              >
                {isLoading
                  ? (
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text className="text-sm font-semibold text-white">Đang xác thực...</Text>
                      </View>
                    )
                  : (
                      <Text className="text-sm font-semibold text-white">Xác nhận đổi</Text>
                    )}
              </Button>
            )}
      </View>
    </View>
  );
}

export function ChangeEmailModal(props: ChangeEmailModalProps) {
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
        {props.visible && <ChangeEmailForm {...props} />}
      </KeyboardAvoidingView>
    </Modal>
  );
}
