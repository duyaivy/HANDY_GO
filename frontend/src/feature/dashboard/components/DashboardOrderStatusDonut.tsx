import React from "react";
import { Layers3, CheckCircle2, XCircle } from "lucide-react";
export interface DashboardOrderStatuses {
  completed: number;
  processing: number;
  cancelled: number;
}
const integer = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
export const DashboardOrderStatusDonut: React.FC<{
  data: DashboardOrderStatuses;
}> = ({ data }) => {
  const total = data.completed + data.processing + data.cancelled;
  const completion = total ? (data.completed / total) * 100 : 0;
  const cancellation = total ? (data.cancelled / total) * 100 : 0;
  const entries = [
    { label: "Hoàn thành", value: data.completed, color: "#22C55E" },
    { label: "Đang xử lý", value: data.processing, color: "#FACC15" },
    { label: "Đã hủy", value: data.cancelled, color: "#EF4444" },
  ];
  let offset = 0;
  const radius = 63,
    circumference = 2 * Math.PI * radius;
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 sm:text-lg">
        <Layers3 className="h-5 w-5 text-[#FF5E14]" />
        Trạng thái đơn hàng
      </h2>
      <div className="mt-4 flex flex-col items-center justify-center gap-4 sm:flex-row">
        <div className="relative h-44 w-44 shrink-0">
          <svg
            viewBox="0 0 180 180"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label="Phân bố trạng thái đơn hàng"
          >
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke="#F1F5F9"
              strokeWidth="20"
            />
            {entries.map((item) => {
              const length = total ? (item.value / total) * circumference : 0;
              const dashOffset = -offset;
              offset += length;
              return (
                <circle
                  key={item.label}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="20"
                  strokeDasharray={`${length} ${circumference}`}
                  strokeDashoffset={dashOffset}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <strong className="text-2xl font-extrabold text-slate-900">
              {integer(total)}
            </strong>
            <span className="text-xs text-slate-600">Tổng đơn</span>
          </div>
        </div>
        <div className="w-full min-w-0 space-y-3">
          {entries.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm"
            >
              <span className="flex items-center gap-2 text-slate-700">
                <span
                  className="h-3 w-3 shrink-0 rounded"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
              <strong className="text-slate-900">{integer(item.value)}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-green-50 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
            Tỷ lệ hoàn thành
          </div>
          <p className="mt-1 text-center text-xl font-extrabold text-green-600">
            {completion.toFixed(1).replace(".", ",")}%
          </p>
        </div>
        <div className="rounded-xl bg-red-50 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <XCircle className="h-6 w-6 shrink-0 text-red-500" />
            Tỷ lệ hủy đơn
          </div>
          <p className="mt-1 text-center text-xl font-extrabold text-red-600">
            {cancellation.toFixed(1).replace(".", ",")}%
          </p>
        </div>
      </div>
    </section>
  );
};
