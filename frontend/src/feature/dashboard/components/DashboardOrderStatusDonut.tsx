import { Check, CircleX, Layers3 } from "lucide-react";
import type { OrderStatus } from "../types/dashboard";

const integer = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
const percent = (n: number) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(n)}%`;
export function DashboardOrderStatusDonut({ data }: { data: OrderStatus }) {
  const total = data.totalOrders;
  const entries = [
    {
      label: "Hoàn thành",
      count: data.groups.completed.count,
      percentage: data.groups.completed.percentage,
      color: "#FF6B21",
    },
    {
      label: "Đang xử lý",
      count: data.groups.processing.count,
      percentage: data.groups.processing.percentage,
      color: "#FDBA95",
    },
    {
      label: "Đã hủy",
      count: data.groups.cancelled.count,
      percentage: data.groups.cancelled.percentage,
      color: "#CBD5E1",
    },
    {
      label: "Tranh chấp",
      count: data.groups.disputed.count,
      percentage: data.groups.disputed.percentage,
      color: "#64748B",
    },
  ];
  const radius = 62,
    circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <section className="min-w-0 rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.035)] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF5E14]">
          <Layers3 className="size-5" strokeWidth={1.8} />
        </span>
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-950">
            Trạng thái đơn hàng
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Phân bố đơn hàng trong khoảng thời gian
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col items-center justify-center gap-5 2xl:flex-row">
        <div className="relative size-[190px] shrink-0">
          <svg
            className="size-full -rotate-90"
            viewBox="0 0 180 180"
            role="img"
            aria-label="Biểu đồ trạng thái đơn hàng"
          >
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke="#F1F5F9"
              strokeWidth="20"
            />
            {entries.map((entry) => {
              const length =
                total > 0 ? (entry.count / total) * circumference : 0;
              const start = offset;
              offset += length;
              return (
                <circle
                  key={entry.label}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth="20"
                  strokeDasharray={`${length} ${circumference}`}
                  strokeDashoffset={-start}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <strong className="text-[28px] font-bold tracking-tight text-slate-950">
              {integer(total)}
            </strong>
            <span className="text-xs text-slate-500">Tổng đơn hàng</span>
          </div>
        </div>
        <div className="w-full min-w-0 space-y-1">
          {entries.map((entry) => (
            <div
              key={entry.label}
              className="flex items-center justify-between gap-2 border-b border-slate-100 py-2.5 last:border-b-0"
            >
              <span className="flex items-center gap-2 text-xs font-medium text-slate-600 sm:text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.label}
              </span>
              <span className="whitespace-nowrap text-xs font-bold text-slate-900 sm:text-sm">
                {integer(entry.count)}{" "}
                <span className="font-normal text-slate-400">
                  ({percent(entry.percentage)})
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600">
            <Check className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500">Tỷ lệ hoàn thành</p>
            <strong className="text-lg font-bold text-emerald-700">
              {percent(data.performance.completionRate)}
            </strong>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-rose-600">
            <CircleX className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-500">Tỷ lệ hủy đơn</p>
            <strong className="text-lg font-bold text-rose-700">
              {percent(data.performance.cancellationRate)}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
