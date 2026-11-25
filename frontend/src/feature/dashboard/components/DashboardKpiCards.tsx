import { Banknote, BriefcaseBusiness, HardHat, UsersRound } from "lucide-react";
import type { DashboardOverview } from "../types/dashboard";

const integer = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
const money = (value: number, currency: string) => {
  if (currency === "VND" && Math.abs(value) >= 1_000_000) {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000)} triệu ₫`;
  }
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currency || "VND",
    maximumFractionDigits: 0,
  }).format(value);
};

export function DashboardKpiCards({ data }: { data: DashboardOverview }) {
  const cards = [
    {
      title: "Doanh thu",
      value: money(data.revenue.total, data.revenue.currency),
      icon: Banknote,
      hint: "Trong khoảng thời gian",
    },
    {
      title: "Tổng đơn hàng",
      value: integer(data.orders.total),
      icon: BriefcaseBusiness,
      hint: "Đơn hàng trong kỳ",
    },
    {
      title: "Thợ hoạt động",
      value: integer(data.workers.activeInPeriod),
      icon: HardHat,
      hint: "Thợ có hoạt động trong kỳ",
    },
    {
      title: "Khách hàng",
      value: integer(data.customers.totalCumulative),
      icon: UsersRound,
      hint: "Tổng khách hàng tích lũy",
    },
  ];

  return (
    <section
      aria-label="Chỉ số tổng quan"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map(({ title, value, icon: Icon, hint }, index) => (
        <div
          key={title}
          className="group flex min-h-[118px] items-start gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.025)] transition-colors hover:border-orange-200"
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${index === 0 ? "bg-orange-50 text-[#FF5E14]" : "bg-slate-100 text-slate-700"}`}
          >
            <Icon className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500 sm:text-sm">
              {title}
            </p>
            <p className="mt-1 break-words text-xl font-bold tracking-tight text-slate-950 sm:text-[23px]">
              {value}
            </p>
            <p className="mt-1.5 text-[11px] leading-4 text-slate-400">
              {hint}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}
