"use client";

import React, { useState } from "react";

export type DashboardRange = "today" | "7days" | "30days" | "custom";
export interface DashboardDateFilter {
  range: DashboardRange;
  from: string;
  to: string;
}
interface DashboardHeaderProps {
  filter: DashboardDateFilter;
  onFilterChange: (filter: DashboardDateFilter) => void;
}

const localDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const makeDateFilter = (range: DashboardRange): DashboardDateFilter => {
  const end = new Date();
  const start = new Date(end);
  if (range === "7days") start.setDate(start.getDate() - 6);
  if (range === "30days" || range === "custom")
    start.setDate(start.getDate() - 29);
  return { range, from: localDate(start), to: localDate(end) };
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

const inputCls =
  "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900";

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  filter,
  onFilterChange,
}) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(filter.from);
  const [draftTo, setDraftTo] = useState(filter.to);
  const [error, setError] = useState("");

  const choose = (range: DashboardRange) => {
    if (range === "custom") {
      setDraftFrom(filter.from);
      setDraftTo(filter.to);
      setError("");
      setCustomOpen((previous) => !previous);
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
    onFilterChange({ range: "custom", from: draftFrom, to: draftTo });
    setCustomOpen(false);
    setError("");
  };

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Tổng quan
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {displayDate(filter.from)} – {displayDate(filter.to)}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              aria-pressed={filter.range === value}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter.range === value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {customOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Từ ngày
            <input
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(e) => setDraftFrom(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Đến ngày
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(e) => setDraftTo(e.target.value)}
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={applyCustom}
            className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Áp dụng
          </button>
          <button
            type="button"
            onClick={() => setCustomOpen(false)}
            className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900"
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
};
