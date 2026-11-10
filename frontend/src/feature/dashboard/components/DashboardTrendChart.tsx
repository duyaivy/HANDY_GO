"use client";
import React, { useState } from "react";

export interface TrendPoint {
  label: string;
  value: number;
}

export const DashboardTrendChart: React.FC<{ data: TrendPoint[] }> = ({
  data,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 700,
    height = 240,
    left = 36,
    right = 12,
    top = 16,
    bottom = 32;
  const values = data.length ? data : [{ label: "—", value: 0 }];
  const maxY = Math.ceil(Math.max(10, ...values.map((p) => p.value)) / 20) * 20;
  const x = (i: number) =>
    left +
    (values.length === 1
      ? (width - left - right) / 2
      : (i / (values.length - 1)) * (width - left - right));
  const y = (v: number) =>
    height - bottom - (v / maxY) * (height - top - bottom);
  const points = values.map((p, i) => ({ ...p, x: x(i), y: y(p.value) }));
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const active = hovered ?? points.length - 1;
  const selected = points[active];
  const every = Math.max(1, Math.ceil(points.length / 8));

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-900">
          Đơn hàng theo thời gian
        </h2>
        <p className="text-sm text-slate-500">
          {selected.label}:{" "}
          <span className="font-medium text-slate-900">
            {selected.value} đơn
          </span>
        </p>
      </div>
      <div className="mt-4 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Biểu đồ số đơn hàng theo thời gian"
          className="min-w-[480px] w-full"
          onMouseLeave={() => setHovered(null)}
        >
          {[0, 0.5, 1].map((f) => {
            const v = Math.round(maxY * f);
            return (
              <g key={f}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#F1F5F9"
                />
                <text
                  x={left - 8}
                  y={y(v) + 4}
                  fontSize="11"
                  fill="#64748B"
                  textAnchor="end"
                >
                  {v}
                </text>
              </g>
            );
          })}
          <path
            d={path}
            fill="none"
            stroke="#0F172A"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <line
            x1={selected.x}
            x2={selected.x}
            y1={top}
            y2={height - bottom}
            stroke="#E2E8F0"
          />
          <circle
            cx={selected.x}
            cy={selected.y}
            r="4"
            fill="#FF5E14"
            stroke="white"
            strokeWidth="2"
          />
          {points.map((p, i) => (
            <g key={`${p.label}-${i}`} onMouseEnter={() => setHovered(i)}>
              <rect
                x={
                  p.x -
                  (width - left - right) / Math.max(1, points.length - 1) / 2
                }
                y={top}
                width={(width - left - right) / Math.max(1, points.length - 1)}
                height={height - top - bottom}
                fill="transparent"
              />
              {(i % every === 0 || i === points.length - 1) && (
                <text
                  x={p.x}
                  y={height - 10}
                  fontSize="11"
                  fill="#64748B"
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
};
