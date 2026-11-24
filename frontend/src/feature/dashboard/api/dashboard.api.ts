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
  const query = new URLSearchParams({
    period: params.period,
  });

  if (params.period === "custom") {
    if (params.startDate) {
      query.set("startDate", params.startDate);
    }

    if (params.endDate) {
      query.set("endDate", params.endDate);
    }
  }

  return query.toString();
}

async function getMetric<T>(
  metric: Metric,
  params: DashboardParams,
): Promise<T> {
  const response = await http.get<ApiResponse<T>>(
    `/api/dashboard/${metric}?${buildQuery(params)}`,
    {
      baseUrl: "",
    },
  );

  return response.payload.data;
}

export const dashboardApi = {
  overview: (params: DashboardParams) =>
    getMetric<DashboardOverview>("overview", params),

  orderTrend: (params: DashboardParams) =>
    getMetric<OrderTrend>("order-trend", params),

  orderStatus: (params: DashboardParams) =>
    getMetric<OrderStatus>("order-status", params),

  topWorkers: (params: DashboardParams) =>
    getMetric<TopWorker[]>("top-workers", params),

  topServices: (params: DashboardParams) =>
    getMetric<TopService[]>("top-services", params),
};
