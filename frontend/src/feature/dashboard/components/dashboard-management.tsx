"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useDashboard } from "../hooks/use-dashboard";
import type { DashboardParams } from "../types/dashboard";
import {
  DashboardDateFilter,
  DashboardHeader,
  makeDateFilter,
} from "./DashboardHeader";
import { DashboardKpiCards } from "./DashboardKpiCards";
import { DashboardOrderStatusDonut } from "./DashboardOrderStatusDonut";
import { DashboardTopWorkers } from "./DashboardTopWorkers";
import { DashboardPopularServices } from "./DashboardPopularServices";
import { DashboardTrendChart } from "./DashboardTrendChart";

function Loading({ label = "Đang tải dữ liệu" }: { label?: string }) {
  return (
    <div
      role="status"
      className="animate-pulse rounded-[22px] border border-slate-200 bg-white p-5 sm:p-6"
    >
      <span className="sr-only">{label}</span>
      <div className="h-4 w-1/3 rounded bg-slate-100" />
      <div className="mt-5 h-28 rounded-xl bg-slate-100" />
      <div className="mt-4 h-3 w-2/3 rounded bg-slate-100" />
    </div>
  );
}
function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-[22px] border border-red-100 bg-white p-5 text-sm"
    >
      <p className="flex items-center gap-2 text-red-600">
        <AlertCircle className="size-4 shrink-0" />
        Không thể tải dữ liệu. Vui lòng kiểm tra kết nối hoặc quyền Admin.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Thử lại
      </button>
    </div>
  );
}
function SectionState({
  pending,
  error,
  onRetry,
  children,
}: {
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (pending) return <Loading />;
  if (error) return <ErrorBlock onRetry={onRetry} />;
  return <>{children}</>;
}
export default function DashboardManagement() {
  const [filter, setFilter] = useState<DashboardDateFilter>(() =>
    makeDateFilter("30days"),
  );
  const params: DashboardParams =
    filter.range === "custom"
      ? { period: "custom", startDate: filter.from, endDate: filter.to }
      : { period: filter.range };
  const { overview, orderTrend, orderStatus, topWorkers, topServices } =
    useDashboard(params);
  const refreshing = [
    overview,
    orderTrend,
    orderStatus,
    topWorkers,
    topServices,
  ].some((q) => q.isFetching);
  const refresh = () => {
    void overview.refetch();
    void orderTrend.refetch();
    void orderStatus.refetch();
    void topWorkers.refetch();
    void topServices.refetch();
  };
  return (
    <main className="w-full min-w-0 space-y-5 pb-8 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <DashboardHeader filter={filter} onFilterChange={setFilter} />
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-orange-200 hover:text-[#F36B21] disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Làm mới
        </button>
      </div>
      <SectionState
        pending={overview.isPending}
        error={overview.isError}
        onRetry={() => void overview.refetch()}
      >
        {overview.data && <DashboardKpiCards data={overview.data} />}
      </SectionState>
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)] xl:gap-5">
        <SectionState
          pending={orderTrend.isPending}
          error={orderTrend.isError}
          onRetry={() => void orderTrend.refetch()}
        >
          {orderTrend.data && <DashboardTrendChart data={orderTrend.data} />}
        </SectionState>
        <SectionState
          pending={orderStatus.isPending}
          error={orderStatus.isError}
          onRetry={() => void orderStatus.refetch()}
        >
          {orderStatus.data && (
            <DashboardOrderStatusDonut data={orderStatus.data} />
          )}
        </SectionState>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-5">
        <SectionState
          pending={topWorkers.isPending}
          error={topWorkers.isError}
          onRetry={() => void topWorkers.refetch()}
        >
          {topWorkers.data && <DashboardTopWorkers data={topWorkers.data} />}
        </SectionState>
        <SectionState
          pending={topServices.isPending}
          error={topServices.isError}
          onRetry={() => void topServices.refetch()}
        >
          {topServices.data && (
            <DashboardPopularServices data={topServices.data} />
          )}
        </SectionState>
      </div>
    </main>
  );
}
