import React from 'react';
import { Calendar, RefreshCw } from 'lucide-react';

export interface DashboardHeaderProps {
  dateText?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  dateText = 'Hôm nay: 24/10/2024',
  onRefresh,
  isRefreshing = false,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
      {/* TIÊU ĐỀ & MÔ TẢ */}
      <div>
        <h1 className="text-2xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tổng quan hệ thống và các hoạt động vận hành
        </p>
      </div>

      {/* CỤM NÚT THỜI GIAN & LÀM MỚI (BÊN PHẢI) */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Nút Ngày hôm nay */}
        <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 shadow-2xs font-medium">
          <Calendar className="w-4 h-4 text-orange-500" />
          <span>
            {dateText.startsWith('Hôm nay:') ? (
              <>
                <span className="text-slate-500 font-normal">Hôm nay: </span>
                <span className="font-bold text-slate-800">
                  {dateText.replace('Hôm nay:', '').trim()}
                </span>
              </>
            ) : (
              dateText
            )}
          </span>
        </div>

        {/* Nút Làm mới màu cam nổi bật */}
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-[#FF5E14] hover:bg-[#e6520f] active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-orange-500/20 transition-all cursor-pointer"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] ${
              isRefreshing ? 'animate-spin' : ''
            }`}
          />
          <span>Làm mới</span>
        </button>
      </div>
    </div>
  );
};
