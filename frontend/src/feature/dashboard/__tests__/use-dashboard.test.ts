import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api/http";
import { dashboardApi } from "../api/dashboard.api";
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

describe("shouldRetryDashboard & dashboardRetryDelay (HG-75 P2)", () => {
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

  it("retries transient 408/429/5xx and network errors up to failureCount <= 2 with exponential backoff", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      const err = new HttpError({ status, payload: { message: "transient" } });
      expect(shouldRetryDashboard(0, err)).toBe(true);
      expect(shouldRetryDashboard(2, err)).toBe(true);
      expect(shouldRetryDashboard(3, err)).toBe(false);
    }

    expect(shouldRetryDashboard(0, new Error("Network failure"))).toBe(true);
    expect(shouldRetryDashboard(3, new Error("Network failure"))).toBe(false);

    expect(dashboardRetryDelay(0)).toBe(1000);
    expect(dashboardRetryDelay(1)).toBe(2000);
    expect(dashboardRetryDelay(5)).toBe(8000);
  });
});

describe("useDashboard AbortSignal forwarding (HG-75 P2)", () => {
  beforeEach(() => {
    vi.mocked(dashboardApi.overview).mockReset();
    vi.mocked(dashboardApi.orderTrend).mockReset();
    vi.mocked(dashboardApi.orderStatus).mockReset();
    vi.mocked(dashboardApi.topWorkers).mockReset();
    vi.mocked(dashboardApi.topServices).mockReset();
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
});

