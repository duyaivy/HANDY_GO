import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { PaymentApi } from '../../api/payment.api';
import { response, workerPayment } from '../../worker/__tests__/fixtures';
import { CASH_PAYMENTS_PAGE_SIZE, useWorkerCashPayments } from '../use-worker-cash-payments';

jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: { use: { user: () => ({ id: 'worker-1' }) } },
}));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { getMyPayments: jest.fn() } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(useWorkerCashPayments, { wrapper });
}

beforeEach(() => jest.clearAllMocks());

it('paginates cash payments with useInfiniteQuery page by page', async () => {
  const page1 = { ...workerPayment, id: 'payment-p1' };
  const page2 = { ...workerPayment, id: 'payment-p2' };

  jest.mocked(PaymentApi.getMyPayments).mockImplementation(async ({ page } = {}) => {
    if (page === 1) {
      return response({
        items: [page1],
        page: 1,
        limit: CASH_PAYMENTS_PAGE_SIZE,
        total: 2,
        totalPages: 2,
      });
    }
    return response({
      items: [page2],
      page: 2,
      limit: CASH_PAYMENTS_PAGE_SIZE,
      total: 2,
      totalPages: 2,
    });
  });

  const { result } = setup();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(PaymentApi.getMyPayments).toHaveBeenCalledTimes(1);
  expect(PaymentApi.getMyPayments).toHaveBeenCalledWith(
    { page: 1, limit: CASH_PAYMENTS_PAGE_SIZE },
    expect.anything(),
  );
  expect(result.current.data?.pages[0]?.items).toEqual([page1]);
  expect(result.current.hasNextPage).toBe(true);

  // Fetch next page
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

  expect(PaymentApi.getMyPayments).toHaveBeenCalledTimes(2);
  expect(PaymentApi.getMyPayments).toHaveBeenLastCalledWith(
    { page: 2, limit: CASH_PAYMENTS_PAGE_SIZE },
    expect.anything(),
  );
  expect(result.current.data?.pages[1]?.items).toEqual([page2]);
  expect(result.current.hasNextPage).toBe(false);
});

it('handles error state properly when page fails to load', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockRejectedValue(new Error('Failed to load'));

  const { result } = setup();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error?.message).toBe('Failed to load');
});
