import type { ListRenderItemInfo } from '@shopify/flash-list';
import type { WithdrawalRecord } from '../../types/wallet.types';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/stores/use-auth-store';
import { WalletApi } from '../../api/wallet.api';
import { useWallet } from '../../hooks/use-wallet';
import { getPendingWithdrawal, useCancelWithdrawalMutation, useCreateWithdrawalMutation, useWithdrawalsQuery } from '../../hooks/use-withdrawal';
import { walletQueryKeys } from '../../hooks/wallet-query-keys';
import { formatPointsToVND } from '../../utils/formatters';
import { BankAccountCard } from '../components/bank-account-card';
import { BankAccountForm } from '../components/bank-account-form';
import { WithdrawalItem } from '../components/withdrawal-item';

const keyExtractor = (item: WithdrawalRecord) => item.id;
export function WorkerWithdrawScreen() {
  const router = useRouter();
  const userId = useAuthStore.use.user()?.id ?? null;
  const [pending] = useState(() => getPendingWithdrawal(userId));
  const [digits, setDigits] = useState(pending?.amount ?? '');
  const [bankId, setBankId] = useState<string | null>(pending?.bankAccountId ?? null);
  const [addingBank, setAddingBank] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const wallet = useWallet();
  const banks = useQuery({ queryKey: walletQueryKeys.banks(), queryFn: async () => (await WalletApi.getBankAccounts()).data });
  const withdrawals = useWithdrawalsQuery();
  const create = useCreateWithdrawalMutation();
  const cancel = useCancelWithdrawalMutation();
  const { cancelWithdrawal } = cancel;
  const selectedBank = banks.data?.find(item => item.id === bankId) ?? (!bankId ? banks.data?.find(item => item.isDefault) ?? banks.data?.[0] : undefined);
  const amount = digits ? BigInt(digits) : 0n;
  const available = BigInt(wallet.availableBalance);
  const active = wallet.status === 'active' && !wallet.isError && !wallet.isLoading;
  const unresolved = getPendingWithdrawal(userId);
  const retrying = unresolved?.amount === digits && unresolved.bankAccountId === selectedBank?.id;
  const valid = amount >= 50000n && (amount <= available || retrying) && active && Boolean(selectedBank) && Boolean(userId);
  const busy = create.isPending;
  const items = useMemo(() => Array.from(new Map(withdrawals.data?.pages.flatMap(page => page).map(item => [item.id, item])).values()), [withdrawals.data]);
  const cancelItem = useCallback((id: string) => {
    setError(null);
    void cancelWithdrawal(id).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể hủy. Vui lòng tải lại trạng thái lệnh.'));
  }, [cancelWithdrawal]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<WithdrawalRecord>) => <WithdrawalItem item={item} onCancel={cancelItem} cancelling={cancel.isPending} />, [cancelItem, cancel.isPending]);
  const submit = async () => {
    if (!valid || !selectedBank || submitLock.current)
      return;
    submitLock.current = true;
    setError(null);
    try {
      const item = await create.createWithdrawal({ amount: amount.toString(), bankAccountId: selectedBank.id });
      setDigits('');
      Alert.alert('Đã ghi nhận yêu cầu', item.status === 'succeeded' ? 'Ngân hàng đã chi trả theo xác nhận của máy chủ.' : 'Kiểm tra trạng thái lệnh rút bên dưới. Tiền đang xử lý không đồng nghĩa đã chi trả.');
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể gửi yêu cầu rút tiền. Vui lòng thử lại.');
      void wallet.refetch();
    }
    finally { submitLock.current = false; }
  };
  const refresh = () => {
    void Promise.all([wallet.refetch(), banks.refetch(), withdrawals.refetch()]);
  };
  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Rút tiền về ngân hàng" onBack={router.back} />
      <View testID="worker-wallet-withdraw-screen" className="flex-1">
        <FlashList
          keyboardShouldPersistTaps="handled"
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={() => {
            if (withdrawals.hasNextPage && !withdrawals.isFetching && !withdrawals.isFetchNextPageError)
              void withdrawals.fetchNextPage();
          }}
          refreshControl={<RefreshControl refreshing={withdrawals.isRefetching && !withdrawals.isFetchingNextPage} onRefresh={refresh} />}
          ListHeaderComponent={(
            <View className="gap-4 p-4">
              {wallet.isLoading
                ? <ActivityIndicator accessibilityLabel="Đang tải ví" />
                : wallet.isWalletNotFound
                  ? <Text className="text-amber-700">Ví của bạn chưa sẵn sàng</Text>
                  : wallet.isError
                    ? <Pressable accessibilityRole="button" onPress={() => { void wallet.refetch(); }}><Text className="text-red-600">Không thể tải ví. Chạm để thử lại.</Text></Pressable>
                    : (
                        <View className="gap-2">
                          <Text testID="withdraw-available" className="font-bold text-emerald-700 dark:text-emerald-300">{`Khả dụng: ${formatPointsToVND(wallet.availableBalance)}`}</Text>
                          <Text testID="withdraw-reserved" className="text-neutral-700 dark:text-neutral-300">{`Đang tạm giữ: ${formatPointsToVND(wallet.reservedBalance)}`}</Text>
                          {!active ? <Text className="text-amber-700">Ví hiện không hoạt động</Text> : null}
                        </View>
                      )}
              <Text className="font-bold text-neutral-900 dark:text-white">Tài khoản nhận tiền</Text>
              {banks.isPending ? <ActivityIndicator accessibilityLabel="Đang tải ngân hàng" /> : banks.isError ? <Pressable accessibilityRole="button" onPress={() => { void banks.refetch(); }}><Text className="text-red-600">Không thể tải tài khoản ngân hàng. Chạm để thử lại.</Text></Pressable> : banks.data?.length === 0 ? <Text className="text-neutral-500">Chưa có tài khoản ngân hàng. Thêm tài khoản chính chủ trước khi rút.</Text> : banks.data?.map(account => <BankAccountCard key={account.id} account={account} selected={selectedBank?.id === account.id} disabled={busy} onSelect={() => setBankId(account.id)} />)}
              {bankId && banks.isSuccess && !selectedBank ? <Text className="text-red-600">Tài khoản của yêu cầu trước không còn trong danh sách. Vui lòng kiểm tra lại với hỗ trợ.</Text> : null}
              <Pressable testID="withdraw-add-bank-btn" accessibilityRole="button" disabled={busy} onPress={() => setAddingBank(value => !value)}><Text className="font-semibold text-emerald-700 dark:text-emerald-300">{addingBank ? 'Đóng form ngân hàng' : '+ Thêm tài khoản ngân hàng'}</Text></Pressable>
              {addingBank
                ? (
                    <BankAccountForm onSaved={(id) => {
                      setBankId(id);
                      setAddingBank(false);
                    }}
                    />
                  )
                : null}
              <View className="flex-row flex-wrap gap-2">
                {['100000', '200000', '500000'].map(value => <Pressable key={value} testID={`withdraw-amount-${value}`} accessibilityRole="button" disabled={busy} onPress={() => setDigits(value)} className="rounded-xl border border-emerald-600 p-2"><Text className="text-emerald-700 dark:text-emerald-300">{formatPointsToVND(value)}</Text></Pressable>)}
                <Pressable testID="withdraw-all-btn" accessibilityRole="button" disabled={busy || !active} onPress={() => setDigits(wallet.availableBalance)} className="rounded-xl border border-emerald-600 p-2"><Text className="text-emerald-700 dark:text-emerald-300">Rút tất cả số dư</Text></Pressable>
              </View>
              <Input
                testID="withdraw-amount-input"
                label="Số tiền muốn rút"
                placeholder="Tối thiểu 50.000 đ"
                keyboardType="number-pad"
                value={digits ? formatPointsToVND(digits).replace(' đ', '') : ''}
                onChangeText={(text) => {
                  setDigits(text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 19));
                  setError(null);
                }}
                disabled={busy}
              />
              {digits && amount < 50000n ? <Text className="text-red-600">Số tiền rút tối thiểu là 50.000 đ.</Text> : amount > available && !retrying ? <Text className="text-red-600">Số tiền rút vượt quá số dư khả dụng.</Text> : null}
              {unresolved ? <Text className="text-amber-700">Yêu cầu trước chưa rõ kết quả. Giữ nguyên số tiền và ngân hàng để thử lại cùng yêu cầu; số dư có thể đã được tạm giữ.</Text> : null}
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Lệnh mới tạo tạm giữ tiền trong ví. Chỉ lệnh chờ xử lý mới được hủy; khi đã chuyển chi trả, chờ kết quả từ máy chủ.</Text>
              {error ? <Text testID="withdraw-error" className="text-red-600">{error}</Text> : null}
              <Pressable testID="withdraw-confirm-btn" accessibilityRole="button" accessibilityState={{ disabled: !valid || busy }} disabled={!valid || busy} onPress={() => { void submit(); }} className={`items-center rounded-xl p-4 ${valid && !busy ? 'bg-emerald-700' : 'bg-neutral-400'}`}><Text className="font-bold text-white">{busy ? 'Đang gửi...' : 'Xác nhận rút tiền'}</Text></Pressable>
              <Text className="mt-2 font-bold text-neutral-900 dark:text-white">Lệnh rút gần đây</Text>
            </View>
          )}
          ListEmptyComponent={withdrawals.isPending ? <ActivityIndicator accessibilityLabel="Đang tải lệnh rút" /> : withdrawals.isError ? <Pressable accessibilityRole="button" onPress={() => { void withdrawals.refetch(); }} className="p-4"><Text className="text-red-600">Không thể tải lệnh rút. Chạm để thử lại.</Text></Pressable> : <Text className="p-4 text-neutral-500">Chưa có yêu cầu rút tiền.</Text>}
          ListFooterComponent={withdrawals.isFetchingNextPage ? <ActivityIndicator /> : withdrawals.isFetchNextPageError ? <Pressable accessibilityRole="button" onPress={() => { void withdrawals.fetchNextPage(); }} className="p-4"><Text className="text-red-600">Tải thêm thất bại. Chạm để thử lại.</Text></Pressable> : <View className="h-10" />}
        />
      </View>
    </Screen>
  );
}
