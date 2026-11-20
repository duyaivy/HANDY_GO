import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';
import { response, workerPayment } from '../../worker/__tests__/fixtures';
import { useWorkerFinancials } from '../use-worker-financials';

jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => ({ id: 'worker-1' }) } } }));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { getMyPayments: jest.fn() } }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyTransactions: jest.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(useWorkerFinancials, { wrapper });
}
beforeEach(() => jest.clearAllMocks());
it('loads every payment and ledger page and excludes payments owned by another worker', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockImplementation(async ({ page } = {}) => response({
    items: page === 1 ? [workerPayment] : [{ ...workerPayment, id: 'other-payment', workerUserId: 'other-worker' }],
    page: page!,
    limit: 100,
    total: 2,
    totalPages: 2,
  }));
  jest.mocked(WalletApi.getMyTransactions).mockImplementation(async ({ page } = {}) => response({
    items: [{ id: `tx-${page}`, type: 'commission_debit', amount: '10000', referenceId: workerPayment.id, description: null, status: 'completed', createdAt: '2026-11-20' }],
    page: page!,
    limit: 100,
    total: 2,
    totalPages: 2,
  }));
  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(PaymentApi.getMyPayments).toHaveBeenCalledTimes(2);
  expect(WalletApi.getMyTransactions).toHaveBeenCalledTimes(2);
  expect(result.current.data?.payments).toEqual([workerPayment]);
  expect(result.current.data?.transactions).toHaveLength(2);
  expect(result.current.data?.commissionPaid).toBe('20000');
});
it('does not report partial statistics if a later page fails', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValueOnce(response({ items: [workerPayment], page: 1, limit: 100, total: 2, totalPages: 2 })).mockRejectedValueOnce(new Error('Page 2 unavailable'));
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response({ items: [], page: 1, limit: 100, total: 0, totalPages: 0 }));
  const { result } = setup();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});
it('rejects pagination that repeats a page instead of silently losing income', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValue(response({ items: [workerPayment], page: 1, limit: 100, total: 2, totalPages: 2 }));
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response({ items: [], page: 1, limit: 100, total: 0, totalPages: 0 }));
  const { result } = setup();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error?.message).toContain('chưa đầy đủ');
});
