import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';
import { response, workerPayment } from '../../worker/__tests__/fixtures';
import { useWorkerFinancials } from '../use-worker-financials';

jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: { use: { user: () => ({ id: 'worker-1' }) } },
}));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { getMyPayments: jest.fn() } }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyTransactions: jest.fn() } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(useWorkerFinancials, { wrapper });
}

beforeEach(() => jest.clearAllMocks());

it('fetches bounded page 1 in single requests, excludes other workers, and caps recent transactions to 5', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValue(
    response({
      items: [
        workerPayment,
        { ...workerPayment, id: 'other-payment', workerUserId: 'other-worker' },
      ],
      page: 1,
      limit: 100,
      total: 2,
      totalPages: 1,
    }),
  );
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(
    response({
      items: Array.from({ length: 7 }, (_, i) => ({
        id: `tx-${i}`,
        type: 'commission_debit' as const,
        amount: '10000',
        referenceId: workerPayment.id,
        description: null,
        status: 'completed' as const,
        createdAt: '2026-11-20',
      })),
      page: 1,
      limit: 100,
      total: 7,
      totalPages: 1,
    }),
  );

  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  // Exactly 1 request each - no unbounded while/for loops scanning all pages
  expect(PaymentApi.getMyPayments).toHaveBeenCalledTimes(1);
  expect(PaymentApi.getMyPayments).toHaveBeenCalledWith(
    expect.objectContaining({ page: 1, limit: 100 }),
    expect.anything(),
  );

  expect(WalletApi.getMyTransactions).toHaveBeenCalledTimes(1);
  expect(WalletApi.getMyTransactions).toHaveBeenCalledWith(
    expect.objectContaining({ page: 1, limit: 100 }),
    expect.anything(),
  );

  expect(result.current.data?.transactions).toHaveLength(5);
  expect(result.current.data?.summary?.commissionPaid).toBe('70000');
});

it.each(['payments', 'ledger'] as const)('hides totals when %s has 150 records but only page 1 is loaded', async (incompleteSource) => {
  const payments = Array.from({ length: 100 }, (_, index) => ({ ...workerPayment, id: `payment-${index}`, orderId: `order-${index}` }));
  const transactions = Array.from({ length: 100 }, (_, index) => ({
    id: `tx-${index}`,
    type: 'commission_debit' as const,
    amount: '10000',
    referenceId: payments[index]!.id,
    description: null,
    status: 'completed' as const,
    createdAt: '2026-11-20',
  }));
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValue(response({
    items: payments,
    page: 1,
    limit: 100,
    total: incompleteSource === 'payments' ? 150 : 100,
    totalPages: incompleteSource === 'payments' ? 2 : 1,
  }));
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response({
    items: transactions,
    page: 1,
    limit: 100,
    total: incompleteSource === 'ledger' ? 150 : 100,
    totalPages: incompleteSource === 'ledger' ? 2 : 1,
  }));

  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(result.current.data?.summary).toBeNull();
  expect(result.current.data?.transactions.map(item => item.id)).toEqual(['tx-0', 'tx-1', 'tx-2', 'tx-3', 'tx-4']);
  expect(PaymentApi.getMyPayments).toHaveBeenCalledTimes(1);
  expect(WalletApi.getMyTransactions).toHaveBeenCalledTimes(1);
});

it('hides totals when page metadata claims one page but the row count is incomplete', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValue(response({ items: [workerPayment], page: 1, limit: 100, total: 2, totalPages: 1 }));
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response({ items: [], page: 1, limit: 100, total: 0, totalPages: 0 }));

  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.summary).toBeNull();
});

it('hides totals when page 1 contains duplicate IDs despite a matching total', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValue(response({ items: [workerPayment, workerPayment], page: 1, limit: 100, total: 2, totalPages: 1 }));
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response({ items: [], page: 1, limit: 100, total: 0, totalPages: 0 }));

  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.summary).toBeNull();
});

it('fails cleanly when payment query fails', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockRejectedValue(new Error('Network error'));
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(
    response({ items: [], page: 1, limit: 100, total: 0, totalPages: 0 }),
  );

  const { result } = setup();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
  expect(result.current.error?.message).toBe('Network error');
});

it('fails cleanly when wallet ledger query fails', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValue(
    response({ items: [workerPayment], page: 1, limit: 100, total: 1, totalPages: 1 }),
  );
  jest.mocked(WalletApi.getMyTransactions).mockRejectedValue(new Error('Ledger service unavailable'));

  const { result } = setup();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
  expect(result.current.error?.message).toBe('Ledger service unavailable');
});
