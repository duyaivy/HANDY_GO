import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VnpayTopupProvider } from './vnpay-topup.provider.js';

const SECRET = 'unit-test-secret';
const saved = { ...process.env };

function sign(params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
    .join('&');
  return createHmac('sha512', SECRET).update(Buffer.from(data, 'utf-8')).digest('hex');
}

function ipn(overrides: Record<string, string> = {}) {
  const params = {
    vnp_Amount: '10000000',
    vnp_TxnRef: 'HGTEST1',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_TransactionNo: '14000001',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20261105120000',
    vnp_OrderInfo: 'Nap Point HGTEST1',
    ...overrides,
  };
  return { ...params, vnp_SecureHashType: 'HmacSHA512', vnp_SecureHash: sign(params) };
}

beforeEach(() => {
  process.env.VNPAY_TMN_CODE = 'TESTCODE';
  process.env.VNPAY_HASH_SECRET = SECRET;
  process.env.VNPAY_RETURN_URL = 'https://example.test/return';
});
afterEach(() => {
  process.env = { ...saved };
});

describe('VnpayTopupProvider', () => {
  it('is disabled until credentials are configured', () => {
    delete process.env.VNPAY_HASH_SECRET;
    const provider = new VnpayTopupProvider();
    expect(provider.isConfigured()).toBe(false);
    expect(() => provider.buildCheckoutUrl({ txnRef: 'x', amountVnd: 1n, ipAddress: '127.0.0.1', createdAt: new Date(), expiresAt: new Date(), orderInfo: 'x' })).toThrow();
    expect(provider.verifyNotification(ipn()).signatureValid).toBe(false);
  });

  it('builds a signed checkout URL with the amount multiplied by 100', () => {
    const provider = new VnpayTopupProvider();
    const url = provider.buildCheckoutUrl({
      txnRef: 'HGTEST1', amountVnd: 100000n, ipAddress: '10.0.0.1',
      createdAt: new Date('2026-11-05T00:00:00Z'), expiresAt: new Date('2026-11-05T00:15:00Z'), orderInfo: 'Nap Point HGTEST1',
    });
    const [base, query] = url.split('?');
    expect(base).toContain('sandbox.vnpayment.vn');
    const [signData, hash] = query.split('&vnp_SecureHash=');
    expect(hash).toBe(createHmac('sha512', SECRET).update(Buffer.from(signData, 'utf-8')).digest('hex'));
    const params = new URLSearchParams(signData);
    expect(params.get('vnp_Amount')).toBe('10000000');
    expect(params.get('vnp_CreateDate')).toBe('20261105070000');
    expect(params.get('vnp_ExpireDate')).toBe('20261105071500');
    expect(params.get('vnp_OrderInfo')).toBe('Nap Point HGTEST1');
  });

  it('accepts a correctly signed IPN and exposes whole-VND amounts', () => {
    const result = new VnpayTopupProvider().verifyNotification(ipn());
    expect(result).toMatchObject({
      signatureValid: true, txnRef: 'HGTEST1', amountVnd: 100000n, success: true, providerTransactionNo: '14000001',
      eventKey: 'HGTEST1:14000001:00',
    });
    expect(result.auditPayload).not.toHaveProperty('vnp_SecureHash');
  });

  it('rejects tampered, unsigned or malformed notifications', () => {
    const provider = new VnpayTopupProvider();
    expect(provider.verifyNotification({ ...ipn(), vnp_Amount: '99999900' }).signatureValid).toBe(false);
    const { vnp_SecureHash: _hash, ...unsigned } = ipn();
    expect(provider.verifyNotification(unsigned).signatureValid).toBe(false);
    expect(provider.verifyNotification({ ...ipn(), vnp_SecureHash: 'abc' }).signatureValid).toBe(false);
  });

  it('does not treat provider failures or fractional amounts as success', () => {
    const provider = new VnpayTopupProvider();
    expect(provider.verifyNotification(ipn({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' })).success).toBe(false);
    expect(provider.verifyNotification(ipn({ vnp_Amount: '10000050' })).amountVnd).toBeNull();
  });
});
