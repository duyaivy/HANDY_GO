import http from "@/shared/api/http";

import type {
  ApiResponse,
  DashboardParams,
  DashboardOverview,
  OrderTrend,
  OrderStatus,
  TopWorker,
  TopService,
} from "../types/dashboard";

type Metric =
  | "overview"
  | "order-trend"
  | "order-status"
  | "top-workers"
  | "top-services";

function buildQuery(params: DashboardParams) {
  const query = new URLSearchParams({ period: params.period });

  if (params.period === "custom") {
    if (params.startDate) query.set("startDate", params.startDate);
    if (params.endDate) query.set("endDate", params.endDate);
  }

  return query.toString();
}

async function getMetric<T>(
  metric: Metric,
  params: DashboardParams,
  signal?: AbortSignal,
): Promise<T> {
  const response = await http.get<ApiResponse<T>>(
    `/api/dashboard/${metric}?${buildQuery(params)}`,
    {
      baseUrl: "",
      signal,
    },
  );

  return response.payload.data;
}

export const dashboardApi = {
  overview: (params: DashboardParams, signal?: AbortSignal) =>
    getMetric<DashboardOverview>("overview", params, signal),

  orderTrend: (params: DashboardParams, signal?: AbortSignal) =>
    getMetric<OrderTrend>("order-trend", params, signal),

  orderStatus: (params: DashboardParams, signal?: AbortSignal) =>
    getMetric<OrderStatus>("order-status", params, signal),

  topWorkers: (params: DashboardParams, signal?: AbortSignal) =>
    getMetric<TopWorker[]>("top-workers", params, signal),

  topServices: (params: DashboardParams, signal?: AbortSignal) =>
    getMetric<TopService[]>("top-services", params, signal),
};
