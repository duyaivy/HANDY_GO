import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PaymentOperations, {
  getReportComparisonInfo,
} from "../components/payment-operations";
import type { ReconciliationReport } from "../types/operations";

const sampleReports: ReconciliationReport[] = [
  {
    reportDate: "2026-11-24",
    discrepancyCount: 0,
    generatedAt: "2026-11-24T10:00:00.000Z",
    summary: {
      scope: "payment_local_unresolved_snapshot",
      walletLedgerCompared: false,
      deadEvents: 0,
      reviewRefunds: 0,
    },
  },
];

vi.mock("../hooks/use-operations", () => ({
  useDeadLettersQuery: () => ({
    data: { items: [], total: 0, page: 1, limit: 20 },
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useReportsQuery: (page: number) => ({
    data: page === 1 ? sampleReports : [],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useReplayDeadLetter: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useReconcilePayments: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useResolveSandboxPayout: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

describe("getReportComparisonInfo (P2.2)", () => {
  it("reads scope and walletLedgerCompared from report.summary", () => {
    expect(
      getReportComparisonInfo({
        scope: "payment_local_unresolved_snapshot",
        walletLedgerCompared: false,
      }),
    ).toEqual({
      scopeLabel: "Dữ liệu thanh toán HandyGo",
      walletLabel: "Chưa kiểm tra",
      walletCompared: false,
    });

    expect(
      getReportComparisonInfo({
        scope: "full_wallet_reconciliation",
        walletLedgerCompared: true,
      }),
    ).toEqual({
      scopeLabel: "full_wallet_reconciliation",
      walletLabel: "Đã kiểm tra",
      walletCompared: true,
    });

    expect(getReportComparisonInfo({})).toEqual({
      scopeLabel: "Chưa có thông tin",
      walletLabel: "Chưa có thông tin",
      walletCompared: null,
    });

    expect(getReportComparisonInfo(undefined)).toEqual({
      scopeLabel: "Chưa có thông tin",
      walletLabel: "Chưa có thông tin",
      walletCompared: null,
    });
  });

  it("renders 'Chưa kiểm tra' in the reports table when walletLedgerCompared is false and count is 0", () => {
    render(<PaymentOperations />);

    expect(screen.getByText("Dữ liệu thanh toán HandyGo")).toBeInTheDocument();
    expect(screen.getByText("Chưa kiểm tra")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có thông tin")).not.toBeInTheDocument();
  });
});

