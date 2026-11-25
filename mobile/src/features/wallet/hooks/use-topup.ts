import type { TopupRecord } from '../types/payment.types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StorageKeys } from '@/constants/storage-keys';
import { StorageService } from '@/services/storage/storage-service';
import { useAuthStore } from '@/stores/use-auth-store';
import { PaymentApi } from '../api/payment.api';
import { walletQueryKeys } from './wallet-query-keys';

const POLL_INTERVAL_MS = 2_500;
const MAX_POLL_ATTEMPTS = 40;
const TERMINAL_STATUSES = new Set<TopupRecord['status']>([
  'completed',
  'failed',
  'cancelled',
  'expired',
  'needs_review',
]);
const FINISHED_STATUSES = new Set<TopupRecord['status']>(['completed', 'failed', 'cancelled', 'expired']);

export function useTopup() {
  const queryClient = useQueryClient();
  const userId = useAuthStore.use.user()?.id ?? null;
  const [activeTopup, setActiveTopup] = useState<TopupRecord | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [hasPollingTimedOut, setHasPollingTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRunRef = useRef(0);
  const mountedRef = useRef(true);
  const retryRef = useRef<{ userId: string | null; amountVnd: number; idempotencyKey: string } | null>(null);
  const createInFlightRef = useRef<Promise<TopupRecord> | null>(null);

  const cancelPolling = useCallback(() => {
    pollRunRef.current += 1;
    if (timerRef.current)
      clearTimeout(timerRef.current);
    timerRef.current = null;
    if (mountedRef.current)
      setIsPolling(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelPolling();
    };
  }, [cancelPolling]);

  const pollForCompletion = useCallback((topupId: string) => {
    cancelPolling();
    const run = pollRunRef.current;
    let attempts = 0;
    setHasPollingTimedOut(false);
    setIsPolling(true);

    const poll = async () => {
      attempts += 1;
      try {
        const record = (await PaymentApi.getTopupDetail(topupId)).data;
        if (!mountedRef.current || run !== pollRunRef.current)
          return;
        setActiveTopup(record);
        queryClient.setQueryData(walletQueryKeys.topupDetail(topupId), record);
        if (userId && FINISHED_STATUSES.has(record.status))
          StorageService.removeItem(StorageKeys.TOPUP_ATTEMPT(userId, record.amountVnd));
        if (record.status === 'completed') {
          cancelPolling();
          await queryClient.invalidateQueries({ queryKey: walletQueryKeys.all });
          return;
        }
        if (TERMINAL_STATUSES.has(record.status)) {
          cancelPolling();
          return;
        }
      }
      catch {
        if (!mountedRef.current || run !== pollRunRef.current)
          return;
      }
      if (attempts >= MAX_POLL_ATTEMPTS) {
        cancelPolling();
        setHasPollingTimedOut(true);
        return;
      }
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    };

    timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
  }, [cancelPolling, queryClient, userId]);

  const createMutation = useMutation({
    mutationFn: async (payload: { amountVnd: number; idempotencyKey: string }) =>
      (await PaymentApi.createTopup(payload)).data,
  });

  const createTopup = useCallback(async (amountVnd: number): Promise<TopupRecord> => {
    if (createInFlightRef.current)
      return createInFlightRef.current;
    if (!Number.isSafeInteger(amountVnd) || amountVnd < 10_000 || amountVnd > 50_000_000) {
      throw new RangeError('Top-up amount must be between 10,000 and 50,000,000 VND');
    }
    const stored = userId
      ? StorageService.getItem<{ amountVnd: number; idempotencyKey: string }>(StorageKeys.TOPUP_ATTEMPT(userId, amountVnd))
      : null;
    const legacy = userId
      ? StorageService.getItem<{ amountVnd: number; idempotencyKey: string }>(StorageKeys.PENDING_TOPUP(userId))
      : null;
    const retry = retryRef.current?.userId === userId ? retryRef.current : null;
    const previous = retry?.amountVnd === amountVnd
      ? retry
      : stored?.amountVnd === amountVnd && typeof stored.idempotencyKey === 'string'
        ? stored
        : legacy?.amountVnd === amountVnd && typeof legacy.idempotencyKey === 'string'
          ? legacy
          : null;
    const payload = previous
      ? { amountVnd, idempotencyKey: previous.idempotencyKey }
      : { amountVnd, idempotencyKey: randomUUID() };
    retryRef.current = { userId, ...payload };
    if (userId) {
      StorageService.setItem(StorageKeys.TOPUP_ATTEMPT(userId, amountVnd), payload);
      if (legacy?.amountVnd === amountVnd)
        StorageService.removeItem(StorageKeys.PENDING_TOPUP(userId));
    }
    const promise = createMutation.mutateAsync(payload).then((record) => {
      retryRef.current = null;
      if (userId && FINISHED_STATUSES.has(record.status))
        StorageService.removeItem(StorageKeys.TOPUP_ATTEMPT(userId, amountVnd));
      if (mountedRef.current) {
        setActiveTopup(record);
        queryClient.setQueryData(walletQueryKeys.topupDetail(record.id), record);
      }
      return record;
    });
    createInFlightRef.current = promise;
    try {
      return await promise;
    }
    finally {
      createInFlightRef.current = null;
    }
  }, [createMutation, queryClient, userId]);

  const refreshTopup = useCallback(async (topupId: string): Promise<TopupRecord> => {
    const record = (await PaymentApi.getTopupDetail(topupId)).data;
    if (userId && FINISHED_STATUSES.has(record.status))
      StorageService.removeItem(StorageKeys.TOPUP_ATTEMPT(userId, record.amountVnd));
    if (mountedRef.current) {
      setActiveTopup(record);
      queryClient.setQueryData(walletQueryKeys.topupDetail(topupId), record);
      if (record.status === 'completed')
        await queryClient.invalidateQueries({ queryKey: walletQueryKeys.all });
    }
    return record;
  }, [queryClient, userId]);

  const startVnpayCheckout = useCallback(async (checkoutUrl: string, topupId: string) => {
    if (!/^https?:\/\//i.test(checkoutUrl)) {
      throw new Error('Đường dẫn thanh toán không hợp lệ. Vui lòng kiểm tra cấu hình cổng thanh toán.');
    }
    await Linking.openURL(checkoutUrl);
    if (mountedRef.current)
      pollForCompletion(topupId);
  }, [pollForCompletion]);

  const simulateMutation = useMutation({
    mutationFn: async (topupId: string) =>
      (await PaymentApi.simulateTopup(topupId, 'succeeded')).data,
    onSuccess: async (record) => {
      if (!mountedRef.current)
        return;
      setActiveTopup(record);
      queryClient.setQueryData(walletQueryKeys.topupDetail(record.id), record);
      if (userId && FINISHED_STATUSES.has(record.status))
        StorageService.removeItem(StorageKeys.TOPUP_ATTEMPT(userId, record.amountVnd));
      if (record.status === 'completed') {
        cancelPolling();
        await queryClient.invalidateQueries({ queryKey: walletQueryKeys.all });
      }
      else if (!TERMINAL_STATUSES.has(record.status)) {
        pollForCompletion(record.id);
      }
    },
  });

  return {
    createTopup,
    isCreating: createMutation.isPending,
    activeTopup,
    refreshTopup,
    isPolling,
    hasPollingTimedOut,
    startVnpayCheckout,
    cancelPolling,
    simulateTopup: simulateMutation.mutateAsync,
    isSimulating: simulateMutation.isPending,
  };
}
