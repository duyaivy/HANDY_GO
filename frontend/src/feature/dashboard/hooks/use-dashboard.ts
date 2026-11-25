"use client";

import { useQuery } from "@tanstack/react-query";
import { HttpError } from "@/shared/api/http";
import { dashboardApi } from "../api/dashboard.api";
import type { DashboardParams } from "../types/dashboard";

// 4xx không thể khắc phục bằng retry (trừ 408/429).
// Retry tối đa 2 lần cho lỗi mạng, timeout hoặc backend tạm thời lỗi.
export function shouldRetryDashboard(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false;
  if (error.name === "AbortError") return false;

  if (error instanceof HttpError) {
    const status = error.status;
    return status === 408 || status === 429 || status >= 500;
  }

  return true;
}

export function dashboardRetryDelay(attemptIndex: number): number {
  // Exponential backoff, 429 cũng được giãn cách thay vì gửi liên tục.
  return Math.min(1_000 * 2 ** attemptIndex, 8_000);
}

export function useDashboard(params: DashboardParams) {
  const valid =
    params.period !== "custom" || Boolean(params.startDate && params.endDate);
  const key = [params.period, params.startDate ?? "", params.endDate ?? ""];
  const common = {
    enabled: valid,
    staleTime: 60_000,
    retry: shouldRetryDashboard,
    retryDelay: dashboardRetryDelay,
    refetchOnWindowFocus: false,
  };

  return {
    overview: useQuery({
      ...common,
      queryKey: ["dashboard", "overview", ...key],
      queryFn: ({ signal }) => dashboardApi.overview(params, signal),
    }),
    orderTrend: useQuery({
      ...common,
      queryKey: ["dashboard", "order-trend", ...key],
      queryFn: ({ signal }) => dashboardApi.orderTrend(params, signal),
    }),
    orderStatus: useQuery({
      ...common,
      queryKey: ["dashboard", "order-status", ...key],
      queryFn: ({ signal }) => dashboardApi.orderStatus(params, signal),
    }),
    topWorkers: useQuery({
      ...common,
      queryKey: ["dashboard", "top-workers", ...key],
      queryFn: ({ signal }) => dashboardApi.topWorkers(params, signal),
    }),
    topServices: useQuery({
      ...common,
      queryKey: ["dashboard", "top-services", ...key],
      queryFn: ({ signal }) => dashboardApi.topServices(params, signal),
    }),
  };
}
