import type { CreateWithdrawalPayload, WithdrawalRecord } from '../types/wallet.types';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback, useRef } from 'react';
import { StorageKeys } from '@/constants/storage-keys';
import { ApiError } from '@/services/api/api-error';
import { StorageService } from '@/services/storage/storage-service';
import { useAuthStore } from '@/stores/use-auth-store';
import { WalletApi } from '../api/wallet.api';
import { walletQueryKeys } from './wallet-query-keys';

const PAGE_SIZE = 20;
export function getPendingWithdrawal(userId: string | null): CreateWithdrawalPayload | null {
  const value = userId ? StorageService.getItem<CreateWithdrawalPayload>(StorageKeys.PENDING_WITHDRAWAL(userId)) : null;
  return value && typeof value.bankAccountId === 'string' && typeof value.idempotencyKey === 'string' && typeof value.amount === 'string' && /^[1-9]\d*$/.test(value.amount) ? value : null;
}
export function useWithdrawalsQuery() {
  return useInfiniteQuery({
    queryKey: walletQueryKeys.withdrawals(),
    queryFn: async ({ pageParam }) => (await WalletApi.getMyWithdrawals({ page: pageParam, limit: PAGE_SIZE })).data,
    initialPageParam: 1,
    getNextPageParam: (last, pages) => last.length === PAGE_SIZE ? pages.length + 1 : undefined,
    refetchInterval: query => query.state.data?.pages.some(page => page.some(item => item.status === 'requested' || item.status === 'processing')) ? 5000 : false,
  });
}
export function useCreateWithdrawalMutation() {
  const client = useQueryClient();
  const userId = useAuthStore.use.user()?.id ?? null;
  const inFlight = useRef<Promise<WithdrawalRecord> | null>(null);
  const mutation = useMutation({
    mutationFn: async (input: { amount: string; bankAccountId: string }) => {
      if (!userId)
        throw new Error('Vui lòng đăng nhập để rút tiền.');
      if (!/^[1-9]\d*$/.test(input.amount) || BigInt(input.amount) < 50000n)
        throw new Error('Số tiền rút tối thiểu là 50.000 đ.');
      const pending = getPendingWithdrawal(userId);
      if (pending && (pending.amount !== input.amount || pending.bankAccountId !== input.bankAccountId))
        throw new Error('Yêu cầu trước chưa được xác nhận. Giữ nguyên số tiền và tài khoản để thử lại.');
      const payload: CreateWithdrawalPayload = pending ?? { ...input, idempotencyKey: randomUUID() };
      StorageService.setItem(StorageKeys.PENDING_WITHDRAWAL(userId), payload);
      try {
        const result = (await WalletApi.createWithdrawal(payload)).data;
        StorageService.removeItem(StorageKeys.PENDING_WITHDRAWAL(userId));
        return result;
      }
      catch (cause) {
        if (cause instanceof ApiError && cause.statusCode && cause.statusCode >= 400 && cause.statusCode < 500 && ![408, 429].includes(cause.statusCode))
          StorageService.removeItem(StorageKeys.PENDING_WITHDRAWAL(userId));
        throw cause;
      }
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: walletQueryKeys.all }); },
  });
  const createWithdrawal = async (input: { amount: string; bankAccountId: string }) => {
    if (inFlight.current)
      return inFlight.current;
    const promise = mutation.mutateAsync(input);
    inFlight.current = promise;
    try {
      return await promise;
    }
    finally { inFlight.current = null; }
  };
  return { ...mutation, createWithdrawal };
}
export function useCancelWithdrawalMutation() {
  const client = useQueryClient();
  const pending = useRef(new Map<string, Promise<WithdrawalRecord>>());
  const mutation = useMutation({
    mutationFn: async (id: string) => (await WalletApi.cancelWithdrawal(id)).data,
    onSettled: () => { void client.invalidateQueries({ queryKey: walletQueryKeys.all }); },
  });
  const { mutateAsync } = mutation;
  const cancelWithdrawal = useCallback(async (id: string) => {
    const existing = pending.current.get(id);
    if (existing)
      return existing;
    const promise = mutateAsync(id);
    pending.current.set(id, promise);
    try {
      return await promise;
    }
    finally { pending.current.delete(id); }
  }, [mutateAsync]);
  return { ...mutation, cancelWithdrawal };
}
