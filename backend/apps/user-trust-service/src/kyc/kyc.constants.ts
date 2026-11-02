export const KYC_CONSTANTS = {
  KYC_QUEUE: 'user-trust-kyc-worker',
  KYC_DLQ: 'user-trust-kyc-worker.dlq',
  DEFAULT_MAX_RETRIES: 3,
  AI_INFERENCE_TIMEOUT_MS: 360000, // 6 phút (đảm bảo đủ thời gian cho OCR và Face matching trên CPU)
  PRODUCER_NAME: 'user-trust-service',
} as const;

export function maskIdNumber(idStr?: string | null): string {
  if (!idStr) return '';
  const clean = idStr.trim();
  if (clean.length <= 6) return clean;
  const start = clean.slice(0, 3);
  const end = clean.slice(-3);
  const stars = '*'.repeat(Math.max(3, clean.length - 6));
  return `${start}${stars}${end}`;
}
