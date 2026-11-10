"use client";

import React, { useMemo, useState } from "react";
import { DashboardHeader, makeDateFilter, type DashboardDateFilter } from "./components/DashboardHeader";
import { DashboardKpiCards, type DashboardKpis } from "./components/DashboardKpiCards";
import { DashboardTrendChart, type TrendPoint } from "./components/DashboardTrendChart";
import { DashboardOrderStatusDonut, type DashboardOrderStatuses } from "./components/DashboardOrderStatusDonut";
import { DashboardPopularServices, type PopularServiceItem } from "./components/DashboardPopularServices";
import { DashboardTopWorkers, type TopWorkerItem } from "./components/DashboardTopWorkers";

type DailyDemo = { date: string; orders: number; completed: number; processing: number; cancelled: number; revenue: number };
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const labelDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

// Dữ liệu DEMO phục vụ UI; thay bằng response API khi tích hợp backend.
// Sinh cùng một bộ dữ liệu ổn định trong phiên để các bộ lọc dùng chung.
function createDemoDaily(): DailyDemo[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: 120 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (119 - index));
    const orders = 26 + ((index * 13 + 7) % 36) + Math.round(10 * Math.sin(index / 4));
    const completed = Math.round(orders * 0.695);
    const cancelled = Math.round(orders * 0.112);
    const processing = orders - completed - cancelled;
    return { date: dateKey(date), orders, completed, processing, cancelled, revenue: orders * (85000 + (index % 6) * 11000) };
  });
}

const DEMO_DAILY = createDemoDaily();
const DEMO_WORKERS: TopWorkerItem[] = [
  { id: "w1", name: "Nguyễn Văn An", completedOrders: 58, rating: 4.9 },
  { id: "w2", name: "Trần Văn Bình", completedOrders: 45, rating: 4.8 },
  { id: "w3", name: "Lê Minh Cường", completedOrders: 39, rating: 4.8 },
  { id: "w4", name: "Phạm Quốc Huy", completedOrders: 34, rating: 4.7 },
  { id: "w5", name: "Hoàng Minh Đức", completedOrders: 28, rating: 4.7 },
];
const DEMO_SERVICES: PopularServiceItem[] = [
  { id: "s1", name: "Sửa điện", count: 356 },
  { id: "s2", name: "Vệ sinh nhà cửa", count: 298 },
  { id: "s3", name: "Vệ sinh máy lạnh", count: 189 },
  { id: "s4", name: "Sửa chữa nước", count: 132 },
  { id: "s5", name: "Chuyển nhà", count: 98 },
];

function buildTrend(days: DailyDemo[], range: DashboardDateFilter["range"]): TrendPoint[] {
  if (range === "today") return days.map((day) => ({ label: labelDate(day.date), value: day.orders }));
  const step = range === "7days" ? 1 : Math.max(1, Math.ceil(days.length / 11));
  const result: TrendPoint[] = [];
  for (let i = 0; i < days.length; i += step) {
    const group = days.slice(i, i + step);
    result.push({ label: labelDate(group[group.length - 1].date), value: group.reduce((sum, day) => sum + day.orders, 0) });
  }
  return result;
}

export default function DashboardPage() {
  const [filter, setFilter] = useState<DashboardDateFilter>(() => makeDateFilter("30days"));
  const dashboard = useMemo(() => {
    const days = DEMO_DAILY.filter((day) => day.date >= filter.from && day.date <= filter.to);
    const sum = (field: keyof Pick<DailyDemo, "orders" | "completed" | "processing" | "cancelled" | "revenue">) => days.reduce((acc, day) => acc + day[field], 0);
    const statuses: DashboardOrderStatuses = { completed: sum("completed"), processing: sum("processing"), cancelled: sum("cancelled") };
    const kpis: DashboardKpis = {
      revenue: sum("revenue"),
      totalOrders: sum("orders"),
      // Demo giả lập số thợ/khách; backend nên trả đúng số người duy nhất trong kỳ.
      activeWorkers: days.length ? Math.round(328 * Math.min(1, days.length / 30)) : 0,
      customers: days.length ? Math.round(2450 * Math.min(1, days.length / 30)) : 0,
    };
    const ratio = days.length / 30;
    const workers = days.length ? DEMO_WORKERS.map((worker) => ({ ...worker, completedOrders: Math.round(worker.completedOrders * ratio) })) : [];
    const services = days.length ? DEMO_SERVICES.map((service) => ({ ...service, count: Math.round(service.count * ratio) })) : [];
    return { kpis, statuses, trend: buildTrend(days, filter.range), workers, services };
  }, [filter]);

  return (
    <main className="space-y-4 pb-8 sm:space-y-5">
      <DashboardHeader filter={filter} onFilterChange={setFilter} />
      <DashboardKpiCards data={dashboard.kpis} />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <DashboardTrendChart data={dashboard.trend} />
        <DashboardOrderStatusDonut data={dashboard.statuses} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardTopWorkers data={dashboard.workers} />
        <DashboardPopularServices data={dashboard.services} />
      </div>
    </main>
  );
}

export { DashboardPage };
