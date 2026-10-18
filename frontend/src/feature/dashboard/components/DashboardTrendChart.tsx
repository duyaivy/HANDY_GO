"use client";
import React, { useState } from "react";

type TimeRange = "week" | "month" | "year";

interface TrendPoint {
  label: string;
  value: number;
}

const DEFAULT_TREND_DATA: TrendPoint[] = [
  { label: "Th1", value: 480 },
  { label: "Th2", value: 590 },
  { label: "Th3", value: 710 },
  { label: "Th4", value: 790 },
  { label: "Th5", value: 820 },
  { label: "Th6", value: 840 },
  { label: "Th7", value: 890 },
  { label: "Th8", value: 910 },
  { label: "Th9", value: 980 },
  { label: "Th10", value: 1040 },
];

export const DashboardTrendChart: React.FC = () => {
  const [activeRange, setActiveRange] = useState<TimeRange>("month");
  const [hoveredPoint, setHoveredPoint] = useState<TrendPoint | null>(null);

  const data = DEFAULT_TREND_DATA;
  const maxY = 1200;
  const minY = 0;

  // Tọa độ SVG (viewBox 0 0 900 280)
  const width = 900;
  const height = 240;
  const paddingX = 40;
  const paddingY = 20;

  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - paddingX * 2);
    const y =
      height -
      paddingY -
      ((d.value - minY) / (maxY - minY)) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  // Tạo đường cong mượt mà Bezier (Catmull-Rom to Cubic Bezier)
  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const linePath = createSmoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs">
      {/* HEADER: TIÊU ĐỀ & NÚT CHỌN THỜI GIAN */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Xu hướng đơn hàng theo thời gian
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Theo dõi biến động và tăng trưởng số lượng đơn dịch vụ
          </p>
        </div>

        {/* Cụm Tabs: Tuần này / Tháng này / Năm nay */}
        <div className="inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/60 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveRange("week")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeRange === "week"
                ? "bg-white text-orange-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tuần này
          </button>
          <button
            type="button"
            onClick={() => setActiveRange("month")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeRange === "month"
                ? "bg-white text-orange-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tháng này
          </button>
          <button
            type="button"
            onClick={() => setActiveRange("year")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeRange === "year"
                ? "bg-white text-orange-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Năm nay
          </button>
        </div>
      </div>

      {/* DÒNG CHÚ THÍCH & ĐƠN VỊ */}
      <div className="flex items-center justify-between mt-4 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5E14]" />
          <span className="font-semibold text-slate-700">Tổng đơn hàng</span>
        </div>
        <span className="text-slate-400 font-medium">Đơn vị: Đơn hàng</span>
      </div>

      {/* KHUNG BIỂU ĐỒ SVG TƯƠNG TÁC */}
      <div className="relative w-full overflow-x-auto mt-2 select-none">
        <div className="min-w-[680px]">
          <svg
            viewBox={`0 0 ${width} ${height + 30}`}
            className="w-full h-auto overflow-visible"
          >
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF5E14" stopOpacity="0.28" />
                <stop offset="60%" stopColor="#FF5E14" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#FF5E14" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* CÁC ĐƯỜNG KẺ NGANG TRỤC Y */}
            {[
              { val: 1000, label: "1,000" },
              { val: 750, label: "750" },
              { val: 500, label: "500" },
              { val: 250, label: "250" },
            ].map((grid, idx) => {
              const yPos =
                height -
                paddingY -
                ((grid.val - minY) / (maxY - minY)) * (height - paddingY * 2);
              return (
                <g key={idx}>
                  <text
                    x="15"
                    y={yPos + 4}
                    fill="#94A3B8"
                    fontSize="11"
                    fontWeight="500"
                    textAnchor="start"
                  >
                    {grid.label}
                  </text>
                  <line
                    x1="60"
                    y1={yPos}
                    x2={width - 20}
                    y2={yPos}
                    stroke="#E2E8F0"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                </g>
              );
            })}

            {/* VÙNG ĐỔ GRADIENT DƯỚI ĐƯỜNG CONG */}
            <path d={areaPath} fill="url(#trendGradient)" />

            {/* ĐƯỜNG CONG BIỂU ĐỒ CHÍNH MÀU CAM */}
            <path
              d={linePath}
              fill="none"
              stroke="#FF5E14"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* CÁC ĐIỂM CHẤM TRÒN TRÊN BIỂU ĐỒ */}
            {points.map((p, idx) => (
              <g
                key={idx}
                className="cursor-pointer group"
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                {/* Vòng hào quang khi hover */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="12"
                  fill="#FF5E14"
                  fillOpacity="0"
                  className="hover:fill-opacity-15 transition-all"
                />
                {/* Điểm tròn trắng viền cam dày */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="4.5"
                  fill="#FFFFFF"
                  stroke="#FF5E14"
                  strokeWidth="3"
                  className="transition-transform group-hover:scale-125"
                />
                {/* Nhãn tháng ở trục X */}
                <text
                  x={p.x}
                  y={height + 15}
                  fill="#64748B"
                  fontSize="12"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              </g>
            ))}
          </svg>

          {/* TOOLTIP HIỂN THỊ KHI RÊ CHUỘT */}
          {hoveredPoint && (
            <div className="absolute top-2 right-4 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none flex items-center gap-2 animate-in fade-in duration-100">
              <span className="text-orange-300 font-bold">
                {hoveredPoint.label}:
              </span>
              <span>{hoveredPoint.value.toLocaleString()} đơn hàng</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
