"use client";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard.api";
import type { DashboardParams } from "../types/dashboard";

export function useDashboard(params: DashboardParams) {
  const valid =
    params.period !== "custom" || Boolean(params.startDate && params.endDate);
  const key = [params.period, params.startDate ?? "", params.endDate ?? ""];
  const common = {
    enabled: valid,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  };
  return {
    overview: useQuery({
      ...common,
      queryKey: ["dashboard", "overview", ...key],
      queryFn: () => dashboardApi.overview(params),
    }),
    orderTrend: useQuery({
      ...common,
      queryKey: ["dashboard", "order-trend", ...key],
      queryFn: () => dashboardApi.orderTrend(params),
    }),
    orderStatus: useQuery({
      ...common,
      queryKey: ["dashboard", "order-status", ...key],
      queryFn: () => dashboardApi.orderStatus(params),
    }),
    topWorkers: useQuery({
      ...common,
      queryKey: ["dashboard", "top-workers", ...key],
      queryFn: () => dashboardApi.topWorkers(params),
    }),
    topServices: useQuery({
      ...common,
      queryKey: ["dashboard", "top-services", ...key],
      queryFn: () => dashboardApi.topServices(params),
    }),
  };
}
