import React from "react";
import { ChevronRight } from "lucide-react";

export interface PopularServiceItem {
  id: string;
  name: string;
  count: number;
}

export const DashboardPopularServices: React.FC<{
  data: PopularServiceItem[];
  onViewAll?: () => void;
}> = ({ data, onViewAll }) => {
  const items = [...data].sort((a, b) => b.count - a.count).slice(0, 5);
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-900">Dịch vụ phổ biến</h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex items-center text-sm text-slate-500 hover:text-slate-900"
          >
            Xem tất cả <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul className="mt-4 space-y-3.5">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-slate-700" title={item.name}>
                {item.name}
              </span>
              <span className="shrink-0 font-medium text-slate-900">
                {item.count} đơn
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
        {!items.length && (
          <li className="text-sm text-slate-500">
            Chưa có dữ liệu trong khoảng thời gian này.
          </li>
        )}
      </ul>
    </section>
  );
};
