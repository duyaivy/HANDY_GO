import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { WalletApi } from '../../api/wallet.api';
import { walletQueryKeys } from '../../hooks/wallet-query-keys';

export function BankAccountForm({ onSaved }: { onSaved: (id: string) => void }) {
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const client = useQueryClient();
  const lock = useRef(false);
  const mutation = useMutation({ mutationFn: async () => (await WalletApi.addBankAccount({ bankCode: bankCode.trim().toUpperCase(), bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountHolderName: accountHolderName.trim().toUpperCase() })).data });
  const valid = [bankCode, bankName, accountNumber, accountHolderName].every(value => value.trim().length > 0);
  const save = async () => {
    if (!valid || lock.current)
      return;
    lock.current = true;
    try {
      const account = await mutation.mutateAsync();
      await client.invalidateQueries({ queryKey: walletQueryKeys.banks() });
      onSaved(account.id);
    }
    catch { /* The mutation exposes the error below. */ }
    finally { lock.current = false; }
  };
  return (
    <View className="gap-2 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-700">
      <Text className="font-bold text-neutral-900 dark:text-white">Thêm tài khoản ngân hàng</Text>
      <Input testID="withdraw-bank-code-input" label="Mã ngân hàng (VCB, TCB...)" maxLength={20} value={bankCode} onChangeText={setBankCode} disabled={mutation.isPending} autoCapitalize="characters" />
      <Input testID="withdraw-bank-name-input" label="Tên ngân hàng" maxLength={100} value={bankName} onChangeText={setBankName} disabled={mutation.isPending} />
      <Input testID="withdraw-bank-number-input" label="Số tài khoản" maxLength={50} value={accountNumber} onChangeText={setAccountNumber} disabled={mutation.isPending} keyboardType="number-pad" />
      <Input testID="withdraw-bank-holder-input" label="Tên chủ tài khoản" maxLength={150} value={accountHolderName} onChangeText={setAccountHolderName} disabled={mutation.isPending} autoCapitalize="characters" />
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">Chỉ dùng tài khoản chính chủ. Máy chủ kiểm tra quyền sở hữu khi tạo lệnh rút; lưu tài khoản không đồng nghĩa đã được ngân hàng xác minh.</Text>
      {mutation.error ? <Text className="text-red-600">{mutation.error.message}</Text> : null}
      <Pressable testID="withdraw-bank-save-btn" accessibilityRole="button" disabled={!valid || mutation.isPending} onPress={() => { void save(); }} className="items-center rounded-xl bg-emerald-700 p-3"><Text className="font-bold text-white">{mutation.isPending ? 'Đang lưu...' : 'Lưu tài khoản'}</Text></Pressable>
    </View>
  );
}
