import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import paymentsApiRequest from "../api/payments.api";
import { usePaymentStatisticsQuery } from "../hooks/use-payments";

vi.mock("../api/payments.api", () => ({
  default: {
    list: vi.fn(),
    detail: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("usePaymentStatisticsQuery (P3.1)", () => {
  beforeEach(() => {
    vi.mocked(paymentsApiRequest.list).mockReset();
  });

  it("launches all 5 count requests concurrently and preserves partial results on error", async () => {
    const deferreds = Array.from({ length: 5 }, () =>
      createDeferred<{
        status: number;
        payload: { message: string; data: { total: number } };
      }>(),
    );
    const queue = [...deferreds];

    vi.mocked(paymentsApiRequest.list).mockImplementation(
      () => queue.shift()!.promise as ReturnType<typeof paymentsApiRequest.list>,
    );

    const { result } = renderHook(() => usePaymentStatisticsQuery(), {
      wrapper: createWrapper(),
    });

    // Tất cả 5 request phải được khởi chạy ngay trước khi bất kỳ promise nào resolve
    await waitFor(() => {
      expect(paymentsApiRequest.list).toHaveBeenCalledTimes(5);
    });
    expect(result.current.isPending).toBe(true);

    const resolvedTotals = [100, 70, 10, 4, 5];
    deferreds.forEach((deferred, index) => {
      deferred.resolve({
        status: 200,
        payload: { message: "ok", data: { total: resolvedTotals[index] } },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({
      total: 100,
      succeeded: 70,
      processing: 14,
      failed: 5,
      hasUnavailableCount: false,
    });
  });

  it("returns partial statistics when one count fails", async () => {
    vi.mocked(paymentsApiRequest.list).mockImplementation((query) => {
      const status = query.status?.[0];
      if (status === "processing") {
        return Promise.reject(new Error("timeout"));
      }
      const totals: Record<string, number> = {
        all: 100,
        succeeded: 70,
        pending: 10,
        failed: 5,
      };
      const total = totals[status ?? "all"] ?? 0;
      return Promise.resolve({
        status: 200,
        payload: {
          statusCode: 200,
          message: "ok",
          data: { items: [], total, page: 1, limit: 1, totalPages: 1 },
        },
      });
    });

    const { result } = renderHook(() => usePaymentStatisticsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(paymentsApiRequest.list).toHaveBeenCalledTimes(5);
    expect(result.current.data).toEqual({
      total: 100,
      succeeded: 70,
      processing: null,
      failed: 5,
      hasUnavailableCount: true,
    });
  });
});
