import { Injectable } from '@nestjs/common';
import {
  TopupProvider,
  type ProviderNotification,
  type TopupCheckoutInput,
} from './topup-provider.js';

/** Simulates provider confirmation only; Wallet must still commit an actual sandbox ledger credit. */
@Injectable()
export class MockTopupProvider extends TopupProvider {
  readonly name = 'mock';
  isConfigured(): boolean {
    return (
      process.env.NODE_ENV !== 'production' &&
      process.env.TOPUP_MOCK_ENABLED?.trim().toLowerCase() === 'true'
    );
  }
  buildCheckoutUrl(input: TopupCheckoutInput): string {
    if (!this.isConfigured()) throw new Error('Mock top-ups are disabled');
    return `mock://topup/MOCK-${input.txnRef}`;
  }
  verifyNotification(): ProviderNotification {
    // Public VNPAY callbacks can never confirm a mock checkout.
    return {
      signatureValid: false,
      txnRef: null,
      amountVnd: null,
      success: false,
      responseCode: '',
      providerTransactionNo: null,
      eventKey: '',
      auditPayload: {},
    };
  }
  confirmation(
    txnRef: string,
    amount: bigint,
    success: boolean,
  ): ProviderNotification {
    if (!this.isConfigured()) throw new Error('Mock top-ups are disabled');
    return {
      signatureValid: true,
      txnRef,
      amountVnd: amount,
      success,
      responseCode: success ? '00' : '24',
      providerTransactionNo: `MOCK-${txnRef}`,
      eventKey: `MOCK-${txnRef}:${success ? 'succeeded' : 'failed'}`,
      auditPayload: {
        provider: 'mock',
        isSimulated: 'true',
        transactionRef: `MOCK-${txnRef}`,
      },
    };
  }
}
