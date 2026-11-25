export type DeadLetter = {
  eventId: string;
  eventType: string;
  attempts: number;
  status: "dead" | "quarantined" | string;
  createdAt: string;
  updatedAt: string;
};

export type DeadLetterResponse = {
  items: DeadLetter[];
  total: number;
  page: number;
  limit: number;
};

export type ReconciliationReportSummary = {
  scope?: string;
  walletLedgerCompared?: boolean;
  processingPayments?: number;
  stuckTopups?: number;
  reviewRefunds?: number;
  reviewPayouts?: number;
  deadEvents?: number;
  [key: string]: unknown;
};

export type ReconciliationReport = {
  reportDate: string;
  summary: ReconciliationReportSummary;
  discrepancyCount: number;
  generatedAt: string;
};

export type ReplayInput = { eventId: string; reason: string };
export type ReconcileInput = { reason: string };
export type SandboxPayoutInput = {
  status: "succeeded" | "failed";
  reason: string;
  confirmSimulated: true;
};
export type ReconciliationResult = Record<string, string | number>;
