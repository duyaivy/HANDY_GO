import { ApiClient } from '@/services/api/api-client';
import { PaymentApi } from '../payment.api';
import { WalletApi } from '../wallet.api';

jest.mock('@/services/api/api-client', () => ({ ApiClient: { get: jest.fn(), post: jest.fn() } }));
it('uses deployed withdrawal and bank contracts without client-supplied identity or bank details in the payout request', async () => {
  const payload = { amount: '100000', bankAccountId: 'bank-1', idempotencyKey: 'key-1' };
  await WalletApi.createWithdrawal(payload);
  expect(ApiClient.post).toHaveBeenCalledWith('/wallets/me/withdrawals', payload);
  await WalletApi.getMyWithdrawals({ page: 2, limit: 20 });
  expect(ApiClient.get).toHaveBeenCalledWith('/wallets/me/withdrawals', { params: { page: 2, limit: 20 } });
  await WalletApi.getWithdrawal('id/one');
  expect(ApiClient.get).toHaveBeenCalledWith('/wallets/me/withdrawals/id%2Fone');
  await WalletApi.cancelWithdrawal('id/one');
  expect(ApiClient.post).toHaveBeenCalledWith('/wallets/me/withdrawals/id%2Fone/cancel');
  await WalletApi.getBankAccounts();
  expect(ApiClient.get).toHaveBeenCalledWith('/users/me/bank-accounts');
  await PaymentApi.confirmCash('payment/one');
  expect(ApiClient.post).toHaveBeenCalledWith('/payments/payment%2Fone/confirm-cash');
  await PaymentApi.getMyPayments({ page: 1, limit: 100 });
  expect(ApiClient.get).toHaveBeenCalledWith('/payments/me', { params: { page: 1, limit: 100 } });
});
