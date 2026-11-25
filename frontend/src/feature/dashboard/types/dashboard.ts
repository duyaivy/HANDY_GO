export type DashboardPeriod = "today" | "7days" | "30days" | "custom";
export type DashboardParams = {
  period: DashboardPeriod;
  startDate?: string;
  endDate?: string;
};
export type ApiResponse<T> = { statusCode: number; message: string; data: T };
export type DashboardOverview = {
  revenue: { total: number; currency: string };
  orders: { total: number };
  workers: { activeInPeriod: number };
  customers: { totalCumulative: number };
};
export type OrderTrend = {
  granularity: "hour" | "day" | "week" | "month";
  timeline: { bucket: string; orderCount: number }[];
};
export type StatusGroup = { count: number; percentage: number };
export type OrderStatus = {
  totalOrders: number;
  groups: {
    completed: StatusGroup;
    processing: StatusGroup;
    cancelled: StatusGroup;
    disputed: StatusGroup;
  };
  performance: { completionRate: number; cancellationRate: number };
};
export type TopWorker = {
  workerUserId: string;
  fullName: string;
  avatarUrl: string | null;
  completedOrderCount: number;
  averageRating: number | null;
};
export type TopService = {
  serviceId: string;
  name: string;
  iconUrl: string | null;
  completedOrderCount: number;
};
