"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HttpError } from "@/shared/api/http";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useDashboard } from "../hooks/use-dashboard";
import type { DashboardParams } from "../types/dashboard";
import {
  type DashboardDateFilter,
  DashboardHeader,
  makeDateFilter,
  vietnamDate,
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
type DashboardSection =
  | "overview"
  | "orderTrend"
  | "orderStatus"
  | "topWorkers"
  | "topServices";

function getDashboardErrorInfo(error: unknown, section: DashboardSection) {
  if (error instanceof HttpError) {
    const status = error.status;
    if (status === 400 || status === 422) {
      return {
        message:
          "Khoảng thời gian hoặc tham số thống kê không hợp lệ. Hãy chọn lại bộ lọc.",
        canRetry: false,
      };
    }
    if (status === 401) {
      return {
        message:
          "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        canRetry: false,
      };
    }
    if (status === 403) {
      return {
        message:
          "Tài khoản hiện tại không có quyền xem thống kê này. Hãy liên hệ quản trị viên.",
        canRetry: false,
      };
    }
    if (status === 404) {
      return {
        message:
          "Không tìm thấy API thống kê. Vui lòng báo bộ phận kỹ thuật kiểm tra cấu hình Gateway.",
        canRetry: false,
      };
    }
    if (status === 429) {
      return {
        message:
          "Hệ thống đang giới hạn số lượng yêu cầu. Vui lòng thử lại sau ít phút.",
        canRetry: true,
      };
    }
    if (status === 503 && section === "topWorkers") {
      return {
        message:
          "Không thể thống kê thợ nổi bật cho khoảng thời gian này. Dữ liệu có thể vượt giới hạn xử lý; hãy chọn khoảng thời gian ngắn hơn (ví dụ 7 ngày).",
        canRetry: true,
      };
    }
    if (status === 408 || status === 504) {
      return {
        message:
          "Yêu cầu thống kê đã quá thời gian chờ. Hãy thử lại hoặc chọn khoảng thời gian ngắn hơn.",
        canRetry: true,
      };
    }
    if (status >= 500) {
      return {
        message:
          "Hệ thống thống kê đang gặp sự cố tạm thời. Vui lòng thử lại sau.",
        canRetry: true,
      };
    }
  }
  return {
    message:
      "Không thể tải dữ liệu thống kê. Hãy kiểm tra kết nối mạng rồi thử lại.",
    canRetry: true,
  };
}

function ErrorBlock({
  error,
  section,
  onRetry,
}: {
  error: unknown;
  section: DashboardSection;
  onRetry: () => void;
}) {
  const info = getDashboardErrorInfo(error, section);
  return (
    <div
      role="alert"
      className="rounded-[22px] border border-red-100 bg-white p-5 text-sm"
    >
      <p className="flex items-start gap-2 text-red-600">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>{info.message}</span>
      </p>
      {info.canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

function SectionState({
  pending,
  isError,
  error,
  section,
  onRetry,
  children,
}: {
  pending: boolean;
  isError: boolean;
  error: unknown;
  section: DashboardSection;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (pending) return <Loading />;
  if (isError)
    return <ErrorBlock error={error} section={section} onRetry={onRetry} />;
  return <>{children}</>;
}

export default function DashboardManagement() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DashboardDateFilter>(() =>
    makeDateFilter("30days"),
  );
  const lastVietnamDayRef = useRef(vietnamDate());

  // Đồng bộ ngày khi tab đang mở qua nửa đêm (giờ Việt Nam).
  // Cập nhật state trong callback của timer / sự kiện, KHÔNG trong thân effect.
  const checkVietnamDay = useCallback((): boolean => {
    const today = vietnamDate();
    if (lastVietnamDayRef.current === today) return false;

    lastVietnamDayRef.current = today;
    setFilter((current) =>
      current.range === "custom" ? current : makeDateFilter(current.range),
    );
    // Preset có query key giữ nguyên (today/7days/30days), nên cần invalidate
    // để lấy lại số liệu tương ứng với ngày mới của Backend.
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    return true;
  }, [queryClient]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkVietnamDay();
    };
    const interval = window.setInterval(checkVietnamDay, 30_000);
    window.addEventListener("focus", checkVietnamDay);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkVietnamDay);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkVietnamDay]);

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
    // Nếu vừa sang ngày mới, invalidateQueries đã tự refetch các query.
    if (checkVietnamDay()) return;
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
        isError={overview.isError}
        error={overview.error}
        section="overview"
        onRetry={() => void overview.refetch()}
      >
        {overview.data && <DashboardKpiCards data={overview.data} />}
      </SectionState>
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)] xl:gap-5">
        <SectionState
          pending={orderTrend.isPending}
          isError={orderTrend.isError}
          error={orderTrend.error}
          section="orderTrend"
          onRetry={() => void orderTrend.refetch()}
        >
          {orderTrend.data && <DashboardTrendChart data={orderTrend.data} />}
        </SectionState>
        <SectionState
          pending={orderStatus.isPending}
          isError={orderStatus.isError}
          error={orderStatus.error}
          section="orderStatus"
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
          isError={topWorkers.isError}
          error={topWorkers.error}
          section="topWorkers"
          onRetry={() => void topWorkers.refetch()}
        >
          {topWorkers.data && <DashboardTopWorkers data={topWorkers.data} />}
        </SectionState>
        <SectionState
          pending={topServices.isPending}
          isError={topServices.isError}
          error={topServices.error}
          section="topServices"
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
