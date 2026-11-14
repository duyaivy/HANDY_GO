export interface TopupCheckoutInput {
  txnRef: string;
  amountVnd: bigint;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
  orderInfo: string;
}

export interface ProviderNotification {
  signatureValid: boolean;
  txnRef: string | null;
  amountVnd: bigint | null;
  success: boolean;
  responseCode: string;
  providerTransactionNo: string | null;
  eventKey: string;
  // Provider-signed fields that are safe to persist (no signature, no PII).
  auditPayload: Record<string, string>;
}

export abstract class TopupProvider {
  abstract readonly name: string;
  abstract isConfigured(): boolean;
  abstract buildCheckoutUrl(input: TopupCheckoutInput): string;
  abstract verifyNotification(query: Record<string, string>): ProviderNotification;
}
