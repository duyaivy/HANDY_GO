"use client";

import { useId, useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import type { OrderTrend } from "../types/dashboard";

const integer = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
const formatBucket = (
  bucket: string,
  granularity: OrderTrend["granularity"],
) => {
  if (granularity === "hour") return bucket.slice(11, 16);
  if (granularity === "month")
    return `${bucket.slice(5, 7)}/${bucket.slice(0, 4)}`;
  const [year, month, day] = bucket.split("-");
  return granularity === "week" ? `${day}/${month}/${year}` : `${day}/${month}`;
};
const granularityLabel: Record<OrderTrend["granularity"], string> = {
  hour: "Theo giờ",
  day: "Theo ngày",
  week: "Theo tuần",
  month: "Theo tháng",
};

export function DashboardTrendChart({ data }: { data: OrderTrend }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");
  const width = 780,
    height = 290,
    left = 43,
    right = 18,
    top = 22,
    bottom = 38;
  const values = data.timeline ?? [];
  const max = Math.max(1, ...values.map((p) => p.orderCount));
  const step = Math.max(1, Math.ceil(max / 4));
  const maxY = step * 4;
  const plotWidth = width - left - right;
  const x = (i: number) =>
    left +
    (values.length <= 1
      ? plotWidth / 2
      : (i * plotWidth) / (values.length - 1));
  const y = (n: number) =>
    height - bottom - (n / maxY) * (height - top - bottom);
  const points = values.map((p, i) => ({
    ...p,
    label: formatBucket(p.bucket, data.granularity),
    x: x(i),
    y: y(p.orderCount),
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
    .join(" ");
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x},${height - bottom} L${points[0].x},${height - bottom} Z`
    : "";
  const activeIndex =
    hovered !== null && hovered < points.length ? hovered : points.length - 1;
  const active = points[activeIndex];
  const every = Math.max(1, Math.ceil(points.length / 7));
  const total = values.reduce((sum, p) => sum + p.orderCount, 0);

  return (
    <section className="min-w-0 rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.035)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF5E14]">
            <ChartNoAxesCombined className="size-5" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-950">
              Xu hướng đơn hàng
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Số đơn hàng phát sinh theo thời gian
            </p>
          </div>
        </div>
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          {granularityLabel[data.granularity]}
        </span>
      </div>
      <div className="mt-6 flex flex-wrap items-baseline gap-2">
        <strong className="text-[25px] font-bold tracking-tight text-slate-950">
          {integer(total)}
        </strong>
        <span className="text-xs text-slate-500">đơn trong kỳ</span>
      </div>
      {!points.length ? (
        <div className="flex h-[290px] items-center justify-center text-sm text-slate-400">
          Chưa có dữ liệu trong khoảng thời gian này.
        </div>
      ) : (
        <div className="mt-2 w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Xu hướng đơn hàng theo thời gian"
            className="w-full min-w-[460px]"
            onMouseLeave={() => setHovered(null)}
          >
            <defs>
              <linearGradient
                id={`trendFill-${id}`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#FF5E14" stopOpacity="0.21" />
                <stop offset="100%" stopColor="#FF5E14" stopOpacity="0.015" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((tick) => {
              const n = tick * step;
              return (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(n)}
                    y2={y(n)}
                    stroke="#E9EDF2"
                    strokeDasharray={tick === 0 ? undefined : "3 5"}
                  />
                  <text
                    x={left - 11}
                    y={y(n) + 4}
                    fontSize="11"
                    fill="#94A3B8"
                    textAnchor="end"
                  >
                    {n}
                  </text>
                </g>
              );
            })}
            <path d={areaPath} fill={`url(#trendFill-${id})`} />
            <path
              d={linePath}
              fill="none"
              stroke="#FF5E14"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {active && (
              <g>
                <line
                  x1={active.x}
                  x2={active.x}
                  y1={top}
                  y2={height - bottom}
                  stroke="#FB923C"
                  strokeDasharray="4 5"
                  opacity="0.7"
                />
                <circle
                  cx={active.x}
                  cy={active.y}
                  r="5"
                  fill="#FF5E14"
                  stroke="white"
                  strokeWidth="3"
                />
                <g
                  transform={`translate(${Math.min(width - 147, Math.max(left, active.x - 65))}, ${Math.max(4, active.y - 55)})`}
                >
                  <rect
                    width="130"
                    height="43"
                    rx="10"
                    fill="white"
                    stroke="#E2E8F0"
                  />
                  <text x="11" y="17" fontSize="11" fill="#64748B">
                    {active.label}
                  </text>
                  <text
                    x="11"
                    y="33"
                    fontSize="13"
                    fontWeight="700"
                    fill="#0F172A"
                  >
                    {integer(active.orderCount)} đơn hàng
                  </text>
                </g>
              </g>
            )}
            {points.map((p, i) => (
              <g key={`${p.bucket}-${i}`} onMouseEnter={() => setHovered(i)}>
                <rect
                  x={p.x - plotWidth / Math.max(1, points.length - 1) / 2}
                  y={top}
                  width={plotWidth / Math.max(1, points.length - 1)}
                  height={height - top - bottom}
                  fill="transparent"
                />
                {(i % every === 0 || i === points.length - 1) && (
                  <text
                    x={p.x}
                    y={height - 12}
                    fontSize="11"
                    fill="#94A3B8"
                    textAnchor="middle"
                  >
                    {p.label}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      )}
    </section>
  );
}
