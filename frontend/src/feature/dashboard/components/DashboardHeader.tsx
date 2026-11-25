"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { DashboardPeriod } from "../types/dashboard";

export type DashboardRange = DashboardPeriod;
export interface DashboardDateFilter {
  range: DashboardRange;
  from: string;
  to: string;
}
interface DashboardHeaderProps {
  filter: DashboardDateFilter;
  onFilterChange: (filter: DashboardDateFilter) => void;
}

const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";
const vietnamDayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Trả về YYYY-MM-DD theo giờ Việt Nam, bất kể timezone trình duyệt. */
export function vietnamDate(date: Date = new Date()): string {
  const parts = vietnamDayFormatter.formatToParts(date);
  const get = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Trừ ngày theo lịch UTC để tránh ảnh hưởng DST/timezone của máy. */
function subtractCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day - days));
  return shifted.toISOString().slice(0, 10);
}

export const makeDateFilter = (
  range: DashboardRange,
  now: Date = new Date(),
): DashboardDateFilter => {
  const to = vietnamDate(now);
  const daysBack =
    range === "7days" ? 6 : range === "30days" || range === "custom" ? 29 : 0;
  return { range, from: subtractCalendarDays(to, daysBack), to };
};

const displayDate = (value: string) => {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
};

const OPTIONS = [
  ["today", "Hôm nay"],
  ["7days", "7 ngày"],
  ["30days", "30 ngày"],
  ["custom", "Tùy chỉnh"],
] as const;

const inputClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#FF5E14] focus:ring-2 focus:ring-orange-100";

export function DashboardHeader({
  filter,
  onFilterChange,
}: DashboardHeaderProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(filter.from);
  const [draftTo, setDraftTo] = useState(filter.to);
  const [error, setError] = useState("");

  const choose = (range: DashboardRange) => {
    if (range === "custom") {
      setDraftFrom(filter.from);
      setDraftTo(filter.to);
      setError("");
      setCustomOpen((open) => !open);
      return;
    }
    setCustomOpen(false);
    onFilterChange(makeDateFilter(range));
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo || draftFrom > draftTo) {
      setError("Vui lòng chọn khoảng ngày hợp lệ.");
      return;
    }
    const days =
      Math.round(
        (Date.parse(`${draftTo}T00:00:00Z`) -
          Date.parse(`${draftFrom}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    if (!Number.isFinite(days) || days > 365) {
      setError("Khoảng ngày tùy chỉnh tối đa 365 ngày.");
      return;
    }
    if (draftTo > vietnamDate()) {
      setError("Ngày kết thúc không được ở tương lai.");
      return;
    }
    onFilterChange({ range: "custom", from: draftFrom, to: draftTo });
    setCustomOpen(false);
    setError("");
  };

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            Tổng quan hệ thống
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Theo dõi hiệu suất hoạt động của HandyGo
          </p>
        </div>
        <div
          role="group"
          aria-label="Lọc thời gian Dashboard"
          className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 bg-slate-100/80 p-1"
        >
          {OPTIONS.map(([range, label]) => (
            <button
              key={range}
              type="button"
              onClick={() => choose(range)}
              aria-pressed={filter.range === range}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                filter.range === range
                  ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <CalendarDays className="size-3.5" />
        <span>
          {displayDate(filter.from)} – {displayDate(filter.to)}
        </span>
      </div>
      {customOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Từ ngày
            <input
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(e) => setDraftFrom(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Đến ngày
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              max={vietnamDate()}
              onChange={(e) => setDraftTo(e.target.value)}
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={applyCustom}
            className="h-9 rounded-lg bg-[#FF5E14] px-4 text-sm font-semibold text-white hover:bg-[#E65310]"
          >
            Áp dụng
          </button>
          <button
            type="button"
            onClick={() => {
              setCustomOpen(false);
              setError("");
            }}
            className="h-9 rounded-lg px-3 text-sm text-slate-500 hover:bg-slate-50"
          >
            Đóng
          </button>
          {error && (
            <p role="alert" className="w-full text-xs text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </header>
  );
}
