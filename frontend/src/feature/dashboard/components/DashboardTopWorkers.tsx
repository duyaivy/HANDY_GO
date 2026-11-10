import React from "react";
import { Trophy, Star, ChevronRight, UserRound } from "lucide-react";
export interface TopWorkerItem {
  id: string;
  name: string;
  completedOrders: number;
  rating: number;
  avatarUrl?: string;
}
export const DashboardTopWorkers: React.FC<{
  data: TopWorkerItem[];
  onViewAll?: () => void;
}> = ({ data, onViewAll }) => {
  const workers = [...data]
    .sort((a, b) => b.completedOrders - a.completedOrders)
    .slice(0, 5);
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 sm:text-lg">
          <Trophy className="h-5 w-5 text-[#FF5E14]" />
          Top thợ hoạt động tốt
        </h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex shrink-0 items-center text-xs font-semibold text-[#FF5E14] hover:underline"
          >
            Xem tất cả <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-4 divide-y divide-slate-100">
        {workers.map((worker) => (
          <div key={worker.id} className="flex items-center gap-3 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50">
              {worker.avatarUrl ? (
                <img
                  src={worker.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-6 w-6 text-blue-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">
                {worker.name}
              </p>
              <p className="text-xs text-slate-600">
                {worker.completedOrders} đơn hoàn thành
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 font-bold text-slate-900">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {worker.rating.toFixed(1)}
            </div>
          </div>
        ))}
        {!workers.length && (
          <p className="py-4 text-sm text-slate-500">
            Không có dữ liệu trong khoảng thời gian này.
          </p>
        )}
      </div>
    </section>
  );
};
