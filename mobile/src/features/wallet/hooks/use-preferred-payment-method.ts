import type { PaymentMethod } from '../types/payment.types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StorageKeys } from '@/constants/storage-keys';
import { StorageService } from '@/services/storage/storage-service';
import { useAuthStore } from '@/stores/use-auth-store';
import { walletQueryKeys } from './wallet-query-keys';

function readPreference(userId: string | null): PaymentMethod {
  const stored = userId ? StorageService.getItem<unknown>(StorageKeys.PREFERRED_PAYMENT_METHOD(userId)) : null;
  return stored === 'cash' ? 'cash' : 'point';
}

/** Local account preference for payment selectors; never submits a payment. */
export function usePreferredPaymentMethod() {
  const userId = useAuthStore.use.user()?.id ?? null;
  const queryClient = useQueryClient();
  const queryKey = walletQueryKeys.preferredPaymentMethod(userId);
  const { data: method } = useQuery({
    queryKey,
    queryFn: () => readPreference(userId),
    initialData: () => readPreference(userId),
    staleTime: Infinity,
  });
  const setMethod = (next: PaymentMethod) => {
    if (!userId)
      return;
    StorageService.setItem(StorageKeys.PREFERRED_PAYMENT_METHOD(userId), next);
    queryClient.setQueryData(queryKey, next);
  };
  return { method, setMethod, canSave: Boolean(userId) };
}
