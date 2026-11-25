import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PaymentManagement from "../components/payment-management";

const mockRefetchStats = vi.fn();

vi.mock("../hooks/use-payments", () => ({
  usePaymentListQuery: () => ({
    data: {
      items: [],
      total: 30,
      page: 1,
      limit: 20,
      totalPages: 2,
    },
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePaymentDetailQuery: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
  }),
  usePaymentStatisticsQuery: () => ({
    data: {
      total: null,
      succeeded: 900,
      processing: 70,
      failed: 30,
      hasUnavailableCount: true,
    },
    isPending: false,
    isFetching: false,
    refetch: mockRefetchStats,
  }),
}));

vi.mock("../components/payment-detail-modal", () => ({
  default: () => null,
}));

vi.mock("../components/payment-table", () => ({
  default: () => <div data-testid="payment-table" />,
}));

describe("PaymentManagement (P2 KPI total fallback)", () => {
  it("does not fall back to filtered list total when global total statistic fails", () => {
    render(<PaymentManagement />);

    const totalCard = screen.getByText("Tổng giao dịch").closest("div")?.parentElement;
    expect(totalCard).not.toBeNull();
    expect(totalCard).toHaveTextContent("—");
    expect(totalCard).not.toHaveTextContent("30");

    expect(
      screen.getByText("Một số số liệu thống kê chưa tải được."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(mockRefetchStats).toHaveBeenCalledTimes(1);
  });
});

