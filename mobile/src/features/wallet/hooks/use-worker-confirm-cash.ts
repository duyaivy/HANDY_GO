import type { OrderPaymentRecord } from '../types/payment.types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { ordersQueryKeys } from '@/features/orders/hooks/orders-query-keys';
import { PaymentApi } from '../api/payment.api';
import { walletQueryKeys } from './wallet-query-keys';

export function useWorkerConfirmCash() {
  const client = useQueryClient();
  const pending = useRef<Promise<OrderPaymentRecord> | null>(null);
  const mutation = useMutation({
    mutationFn: async (paymentId: string) => (await PaymentApi.confirmCash(paymentId)).data,
    onSuccess: async (payment) => {
      client.setQueryData(walletQueryKeys.paymentByOrder(payment.orderId), payment);
      await Promise.all([client.invalidateQueries({ queryKey: walletQueryKeys.all }), client.invalidateQueries({ queryKey: ordersQueryKeys.all })]);
    },
  });
  const confirmCash = async (paymentId: string) => {
    if (pending.current)
      return pending.current;
    const promise = mutation.mutateAsync(paymentId);
    pending.current = promise;
    try {
      return await promise;
    }
    finally { pending.current = null; }
  };
  return { ...mutation, confirmCash };
}
