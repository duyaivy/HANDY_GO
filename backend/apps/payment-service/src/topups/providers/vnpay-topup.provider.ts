import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TopupProvider, type ProviderNotification, type TopupCheckoutInput } from './topup-provider.js';

const SANDBOX_PAY_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const AUDIT_FIELDS = ['vnp_TxnRef', 'vnp_Amount', 'vnp_ResponseCode', 'vnp_TransactionStatus', 'vnp_TransactionNo', 'vnp_BankCode', 'vnp_PayDate'];

// VNPAY signs the key-sorted query with values encoded using `+` for spaces.
function encode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

function canonical(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '')
    .sort()
    .map((key) => `${encode(key)}=${encode(params[key])}`)
    .join('&');
}

// VNPAY expects yyyyMMddHHmmss in GMT+7.
function vnpDate(date: Date): string {
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * VNPAY sandbox adapter. It stays disabled until credentials are configured, and the checkout/IPN
 * contract still has to be verified against the sandbox before it is exposed (see PO-DECISIONS.md).
 */
@Injectable()
export class VnpayTopupProvider extends TopupProvider {
  readonly name = 'vnpay';

  private get tmnCode() {
    return process.env.VNPAY_TMN_CODE?.trim() || undefined;
  }

  private get secret() {
    return process.env.VNPAY_HASH_SECRET?.trim() || undefined;
  }

  private get returnUrl() {
    return process.env.VNPAY_RETURN_URL?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.tmnCode && this.secret && this.returnUrl);
  }

  private sign(payload: string): string {
    return createHmac('sha512', this.secret ?? '').update(Buffer.from(payload, 'utf-8')).digest('hex');
  }

  buildCheckoutUrl(input: TopupCheckoutInput): string {
    if (!this.isConfigured()) throw new Error('VNPAY is not configured');
    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode!,
      vnp_Amount: (input.amountVnd * 100n).toString(),
      vnp_CreateDate: vnpDate(input.createdAt),
      vnp_ExpireDate: vnpDate(input.expiresAt),
      vnp_CurrCode: 'VND',
      vnp_IpAddr: input.ipAddress,
      vnp_Locale: 'vn',
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: this.returnUrl!,
      vnp_TxnRef: input.txnRef,
      vnp_BankCode: 'VNPAYQR',
    };
    const signData = canonical(params);
    const base = process.env.VNPAY_PAY_URL?.trim() || SANDBOX_PAY_URL;
    return `${base}?${signData}&vnp_SecureHash=${this.sign(signData)}`;
  }

  verifyNotification(query: Record<string, string>): ProviderNotification {
    const invalid: ProviderNotification = {
      signatureValid: false,
      txnRef: null,
      amountVnd: null,
      success: false,
      responseCode: '',
      providerTransactionNo: null,
      eventKey: '',
      auditPayload: {},
    };
    const received = query.vnp_SecureHash;
    if (!this.isConfigured() || typeof received !== 'string' || !/^[0-9a-f]{128}$/i.test(received)) return invalid;

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType' && typeof value === 'string') {
        params[key] = value;
      }
    }
    const expected = Buffer.from(this.sign(canonical(params)), 'hex');
    const actual = Buffer.from(received, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return invalid;

    // VNPAY transmits amounts multiplied by 100; anything that is not a whole VND is rejected.
    const rawAmount = params.vnp_Amount;
    const amountVnd = typeof rawAmount === 'string' && /^[1-9]\d*00$/.test(rawAmount) ? BigInt(rawAmount) / 100n : null;
    const responseCode = params.vnp_ResponseCode ?? '';
    const transactionStatus = params.vnp_TransactionStatus;
    const txnRef = params.vnp_TxnRef || null;
    const providerTransactionNo = params.vnp_TransactionNo || null;
    return {
      signatureValid: true,
      txnRef,
      amountVnd,
      success: responseCode === '00' && (transactionStatus === undefined || transactionStatus === '00'),
      responseCode,
      providerTransactionNo,
      eventKey: `${txnRef ?? 'none'}:${providerTransactionNo ?? 'none'}:${responseCode}`,
      auditPayload: Object.fromEntries(AUDIT_FIELDS.filter((key) => params[key] !== undefined).map((key) => [key, params[key]])),
    };
  }
}
