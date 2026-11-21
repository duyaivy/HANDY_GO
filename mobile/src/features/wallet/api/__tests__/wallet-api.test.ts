import { axiosInstance } from '@/services/api/api-client';
import { PaymentApi } from '../payment.api';
import { WalletApi } from '../wallet.api';

const envelope = { statusCode: 200, message: 'ok', data: {} };
let getSpy: jest.SpyInstance;
let postSpy: jest.SpyInstance;

beforeEach(() => {
  getSpy = jest.spyOn(axiosInstance, 'get').mockResolvedValue({ data: envelope });
  postSpy = jest.spyOn(axiosInstance, 'post').mockResolvedValue({ data: envelope });
});
afterEach(() => jest.restoreAllMocks());

describe('WalletApi', () => {
  it('uses the authenticated wallet routes and backend query names', async () => {
    expect(axiosInstance.defaults.baseURL).toMatch(/\/api\/v1$/);
    expect(await WalletApi.getMyWallet()).toEqual(envelope);
    await WalletApi.getMyTransactions({ page: 2, limit: 10, type: 'topup', status: 'completed', from: '2026-01-01', to: '2026-02-01' });
    await WalletApi.getTransactionDetail('tx/1');

    expect(getSpy).toHaveBeenNthCalledWith(1, '/wallets/me', undefined);
    expect(getSpy).toHaveBeenNthCalledWith(2, '/wallets/me/transactions', {
      params: { page: 2, limit: 10, type: 'topup', status: 'completed', from: '2026-01-01', to: '2026-02-01' },
    });
    expect(getSpy).toHaveBeenNthCalledWith(3, '/wallets/me/transactions/tx%2F1', undefined);
  });
});

describe('PaymentApi', () => {
  it('sends an idempotent top-up request and uses the top-up routes', async () => {
    const payload = { amountVnd: 50_000, idempotencyKey: 'fixed-retry-key' };
    expect(await PaymentApi.createTopup(payload)).toEqual(envelope);
    await PaymentApi.getMyTopups({ page: 3, limit: 15 });
    await PaymentApi.getTopupDetail('topup-id');
    await PaymentApi.simulateTopup('topup-id');
    await PaymentApi.simulateTopup('topup-id', 'failed');

    expect(postSpy).toHaveBeenNthCalledWith(1, '/payments/topups', payload, undefined);
    expect(getSpy).toHaveBeenNthCalledWith(1, '/payments/topups', { params: { page: 3, limit: 15 } });
    expect(getSpy).toHaveBeenNthCalledWith(2, '/payments/topups/topup-id', undefined);
    expect(postSpy).toHaveBeenNthCalledWith(2, '/payments/topups/topup-id/simulate', { outcome: 'succeeded', confirmSimulated: true }, undefined);
    expect(postSpy).toHaveBeenNthCalledWith(3, '/payments/topups/topup-id/simulate', { outcome: 'failed', confirmSimulated: true }, undefined);
  });

  it('uses the backend point method and explicit confirmation', async () => {
    await PaymentApi.openPayment({ orderId: 'order-id', method: 'point', expectedAmount: '150000' });
    await PaymentApi.payWithPoints('payment-id');
    await PaymentApi.getPaymentByOrder('order-id');

    expect(postSpy).toHaveBeenNthCalledWith(1, '/payments', { orderId: 'order-id', method: 'point', expectedAmount: '150000' }, undefined);
    expect(postSpy).toHaveBeenNthCalledWith(2, '/payments/payment-id/pay-with-points', { confirm: true }, undefined);
    expect(getSpy).toHaveBeenCalledWith('/payments/order/order-id', undefined);
  });
});
