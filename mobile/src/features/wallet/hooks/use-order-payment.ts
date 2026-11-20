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
    mutationFn: async ({ method, expectedAmount }: { method: PaymentMethod; expectedAmount?: string }) => {
      const payment = (await PaymentApi.openPayment({ orderId, method })).data;
      if (expectedAmount != null && BigInt(payment.amount) !== BigInt(expectedAmount))
        throw new Error('Chi phí đơn hàng đã thay đổi. Vui lòng tải lại đơn trước khi thanh toán.');
      if (['succeeded', 'processing', 'refunded', 'partially_refunded'].includes(payment.status))
        return payment;
      if (method === 'cash')
        return payment;

      const wallet = (await WalletApi.getMyWallet()).data;
      if (wallet.status !== 'active')
        throw new Error('Ví hiện không hoạt động. Vui lòng chọn phương thức khác.');
      const shortfall = BigInt(payment.amount) - BigInt(wallet.availableBalance);
      if (shortfall > 0n)
        throw new InsufficientWalletBalanceError(shortfall.toString());

      return (await PaymentApi.payWithPoints(payment.id)).data;
    },
    onSuccess: async (payment) => {
      queryClient.setQueryData(walletQueryKeys.paymentByOrder(orderId), payment);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: walletQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all }),
      ]);
    },
  });

  const processPayment = async (method: PaymentMethod, expectedAmount?: string): Promise<OrderPaymentRecord> => {
    if (inFlightRef.current)
      return inFlightRef.current;
    const promise = payMutation.mutateAsync({ method, expectedAmount });
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
