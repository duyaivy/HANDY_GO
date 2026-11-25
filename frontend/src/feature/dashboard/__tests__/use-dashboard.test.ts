import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api/http";
import { dashboardApi } from "../api/dashboard.api";
import DashboardManagement from "../components/dashboard-management";
import {
  dashboardRetryDelay,
  shouldRetryDashboard,
  useDashboard,
} from "../hooks/use-dashboard";
import type { DashboardParams } from "../types/dashboard";

vi.mock("../api/dashboard.api", () => ({
  dashboardApi: {
    overview: vi.fn(),
    orderTrend: vi.fn(),
    orderStatus: vi.fn(),
    topWorkers: vi.fn(),
    topServices: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retryDelay: 0 },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("shouldRetryDashboard & dashboardRetryDelay (HG-75 P2/P3)", () => {
  it("does not retry permanent 4xx errors or AbortError", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(
        shouldRetryDashboard(0, new HttpError({ status, payload: { message: "err" } })),
      ).toBe(false);
    }

    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    expect(shouldRetryDashboard(0, abortErr)).toBe(false);
  });

  it("retries transient 408/429/5xx and network errors at most 2 times (count 0/1 true, 2 false) with exponential backoff", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      const err = new HttpError({ status, payload: { message: "transient" } });
      expect(shouldRetryDashboard(0, err)).toBe(true);
      expect(shouldRetryDashboard(1, err)).toBe(true);
      expect(shouldRetryDashboard(2, err)).toBe(false);
    }

    expect(shouldRetryDashboard(0, new Error("Network failure"))).toBe(true);
    expect(shouldRetryDashboard(1, new Error("Network failure"))).toBe(true);
    expect(shouldRetryDashboard(2, new Error("Network failure"))).toBe(false);

    expect(dashboardRetryDelay(0)).toBe(1000);
    expect(dashboardRetryDelay(1)).toBe(2000);
    expect(dashboardRetryDelay(5)).toBe(8000);
  });
});

describe("useDashboard AbortSignal & midnight remount cache (HG-75 P2)", () => {
  beforeEach(() => {
    vi.mocked(dashboardApi.overview).mockReset();
    vi.mocked(dashboardApi.orderTrend).mockReset();
    vi.mocked(dashboardApi.orderStatus).mockReset();
    vi.mocked(dashboardApi.topWorkers).mockReset();
    vi.mocked(dashboardApi.topServices).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards AbortSignal and aborts old filter requests when filter changes rapidly", async () => {
    const signals: AbortSignal[] = [];

    const hangWithSignal = () =>
      new Promise<never>((_resolve, reject) => {
        // Giữ pending cho tới khi đổi filter hoặc unmount
        void reject;
      });

    vi.mocked(dashboardApi.overview).mockImplementation((_p, signal) => {
      if (signal) signals.push(signal);
      return hangWithSignal();
    });
    vi.mocked(dashboardApi.orderTrend).mockImplementation(() => hangWithSignal());
    vi.mocked(dashboardApi.orderStatus).mockImplementation(() => hangWithSignal());
    vi.mocked(dashboardApi.topWorkers).mockImplementation(() => hangWithSignal());
    vi.mocked(dashboardApi.topServices).mockImplementation(() => hangWithSignal());

    const { rerender, unmount } = renderHook(
      ({ params }: { params: DashboardParams }) => useDashboard(params),
      {
        initialProps: { params: { period: "30days" } as DashboardParams },
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(signals).toHaveLength(1);
    });
    expect(signals[0].aborted).toBe(false);

    rerender({ params: { period: "7days" } });

    await waitFor(() => {
      expect(signals).toHaveLength(2);
    });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it("fetches fresh data for all 5 preset queries when unmounted before 00:00 VN and remounted after 00:00 VN with the same QueryClient", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 25/11/2026 23:59:50 giờ Việt Nam (UTC+7)
    vi.setSystemTime(new Date("2026-11-25T16:59:50.000Z"));

    const mockPayloads = (customersTotal: number, ordersTotal: number) => {
      vi.mocked(dashboardApi.overview).mockResolvedValue({
        revenue: { total: 5_000_000, currency: "VND" },
        orders: { total: ordersTotal },
        workers: { activeInPeriod: 10 },
        customers: { totalCumulative: customersTotal },
      });
      vi.mocked(dashboardApi.orderTrend).mockResolvedValue({
        granularity: "day",
        timeline: [{ bucket: "2026-11-25", orderCount: ordersTotal }],
      });
      vi.mocked(dashboardApi.orderStatus).mockResolvedValue({
        totalOrders: ordersTotal,
        groups: {
          completed: { count: ordersTotal, percentage: 100 },
          processing: { count: 0, percentage: 0 },
          cancelled: { count: 0, percentage: 0 },
          disputed: { count: 0, percentage: 0 },
        },
        performance: { completionRate: 100, cancellationRate: 0 },
      });
      vi.mocked(dashboardApi.topWorkers).mockResolvedValue([]);
      vi.mocked(dashboardApi.topServices).mockResolvedValue([]);
    };

    mockPayloads(320, 42);

    const sharedQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const firstRender = render(
      createElement(
        QueryClientProvider,
        { client: sharedQueryClient },
        createElement(DashboardManagement),
      ),
    );

    await waitFor(() => {
      expect(dashboardApi.overview).toHaveBeenCalledTimes(1);
      expect(dashboardApi.orderTrend).toHaveBeenCalledTimes(1);
      expect(dashboardApi.orderStatus).toHaveBeenCalledTimes(1);
      expect(dashboardApi.topWorkers).toHaveBeenCalledTimes(1);
      expect(dashboardApi.topServices).toHaveBeenCalledTimes(1);
      expect(screen.getByText("320")).toBeInTheDocument();
    });
    expect(screen.getByText("27/10/2026 – 25/11/2026")).toBeInTheDocument();

    // Admin chuyển sang màn hình khác (unmount) lúc 23:59:55 VN
    vi.setSystemTime(new Date("2026-11-25T16:59:55.000Z"));
    firstRender.unmount();

    // Quay lại Dashboard lúc 00:00:05 ngày 26/11 VN (vẫn trong staleTime 60s)
    vi.setSystemTime(new Date("2026-11-25T17:00:05.000Z"));
    mockPayloads(450, 58);

    render(
      createElement(
        QueryClientProvider,
        { client: sharedQueryClient },
        createElement(DashboardManagement),
      ),
    );

    await waitFor(() => {
      expect(dashboardApi.overview).toHaveBeenCalledTimes(2);
      expect(dashboardApi.orderTrend).toHaveBeenCalledTimes(2);
      expect(dashboardApi.orderStatus).toHaveBeenCalledTimes(2);
      expect(dashboardApi.topWorkers).toHaveBeenCalledTimes(2);
      expect(dashboardApi.topServices).toHaveBeenCalledTimes(2);
      expect(screen.getByText("450")).toBeInTheDocument();
    });
    expect(screen.getByText("28/10/2026 – 26/11/2026")).toBeInTheDocument();
  });
});
