import React from "react";
import { Banknote, ShoppingBag, UsersRound, UserRound } from "lucide-react";

export interface DashboardKpis {
  revenue: number;
  totalOrders: number;
  activeWorkers: number;
  customers: number;
}

const integer = (value: number) => new Intl.NumberFormat("vi-VN").format(value);
const money = (value: number) =>
  `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value / 1_000_000)} triệu ₫`;

export const DashboardKpiCards: React.FC<{ data: DashboardKpis }> = ({
  data,
}) => {
  const cards = [
    {
      title: "Doanh thu",
      value: money(data.revenue),
      icon: Banknote,
      iconColor: "text-orange-500",
      bg: "bg-orange-50",
    },
    {
      title: "Tổng đơn hàng",
      value: integer(data.totalOrders),
      icon: ShoppingBag,
      iconColor: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Thợ hoạt động",
      value: integer(data.activeWorkers),
      icon: UsersRound,
      iconColor: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: "Khách hàng",
      value: integer(data.customers),
      icon: UserRound,
      iconColor: "text-green-600",
      bg: "bg-green-50",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ title, value, icon: Icon, iconColor, bg }) => (
        <div
          key={title}
          className="flex min-h-[104px] items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
        >
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${bg}`}
          >
            <Icon className={`h-7 w-7 ${iconColor}`} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">{title}</p>
            <p className="mt-1 break-words text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
