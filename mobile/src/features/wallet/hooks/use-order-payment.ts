import type { OrderPaymentRecord, PaymentMethod } from '../types/payment.types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { ordersQueryKeys } from '@/features/orders/hooks/orders-query-keys';
import { PaymentApi } from '../api/payment.api';
import { WalletApi } from '../api/wallet.api';
import { walletQueryKeys } from './wallet-query-keys';

export class InsufficientWalletBalanceError extends Error {
  constructor(readonly shortfall: string) {
    super('Insufficient wallet balance');
    this.name = 'InsufficientWalletBalanceError';
  }
}

export function useOrderPayment(orderId: string) {
  const queryClient = useQueryClient();
  const inFlightRef = useRef<Promise<OrderPaymentRecord> | null>(null);
  const payMutation = useMutation({
    mutationFn: async (method: PaymentMethod) => {
      const payment = (await PaymentApi.openPayment({ orderId, method })).data;
      if (method === 'cash')
        return payment;

      const wallet = (await WalletApi.getMyWallet()).data;
      const shortfall = BigInt(payment.amount) - BigInt(wallet.availableBalance);
      if (shortfall > 0n)
        throw new InsufficientWalletBalanceError(shortfall.toString());

      return (await PaymentApi.payWithPoints(payment.id)).data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: walletQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all }),
      ]);
    },
  });

  const processPayment = async (method: PaymentMethod): Promise<OrderPaymentRecord> => {
    if (inFlightRef.current)
      return inFlightRef.current;
    const promise = payMutation.mutateAsync(method);
    inFlightRef.current = promise;
    try {
      return await promise;
    }
    finally {
      inFlightRef.current = null;
    }
  };

  return {
    processPayment,
    isPaying: payMutation.isPending,
    paymentError: payMutation.error,
  };
}
