import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const mockUseReportsQuery = vi.fn();

vi.mock("../hooks/use-operations", () => ({
  useDeadLettersQuery: () => ({
    data: { items: [], total: 0, page: 1, limit: 20 },
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useReportsQuery: (page: number, limit: number) =>
    mockUseReportsQuery(page, limit),
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

function makeReports(count: number): ReconciliationReport[] {
  return Array.from({ length: count }, (_, index) => ({
    reportDate: `2026-11-${String(index + 1).padStart(2, "0")}`,
    discrepancyCount: index,
    generatedAt: `2026-11-24T10:${String(index).padStart(2, "0")}:00.000Z`,
    summary: {
      scope: "payment_local_unresolved_snapshot",
      walletLedgerCompared: false,
      deadEvents: 0,
      reviewRefunds: 0,
    },
  }));
}

describe("getReportComparisonInfo & PaymentOperations (P2.2 + P3)", () => {
  beforeEach(() => {
    mockUseReportsQuery.mockReset();
  });

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
    mockUseReportsQuery.mockImplementation((page: number) => ({
      data: page === 1 ? sampleReports : [],
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }));

    render(<PaymentOperations />);

    expect(screen.getByText("Dữ liệu thanh toán HandyGo")).toBeInTheDocument();
    expect(screen.getByText("Chưa kiểm tra")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có thông tin")).not.toBeInTheDocument();
  });

  it("shows next-page error and retry instead of treating fetch failure as empty", () => {
    const mockRetryNext = vi.fn();
    mockUseReportsQuery.mockImplementation((page: number) => {
      if (page === 1) {
        return {
          data: makeReports(20),
          isPending: false,
          isFetching: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        };
      }
      return {
        data: undefined,
        isPending: false,
        isFetching: false,
        isError: true,
        error: new Error("Network error"),
        refetch: mockRetryNext,
      };
    });

    render(<PaymentOperations />);

    expect(
      screen.getByText(/Không thể kiểm tra trang báo cáo tiếp theo/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Thử lại/i }));
    expect(mockRetryNext).toHaveBeenCalledTimes(1);
  });

  it("shows checking state while next page probe is loading", () => {
    mockUseReportsQuery.mockImplementation((page: number) => {
      if (page === 1) {
        return {
          data: makeReports(20),
          isPending: false,
          isFetching: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        };
      }
      return {
        data: undefined,
        isPending: true,
        isFetching: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    });

    render(<PaymentOperations />);

    expect(
      screen.getByText(/Đang kiểm tra trang tiếp theo/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });
});
