import React from 'react';

interface PopularServiceItem {
  id: string;
  name: string;
  count: number;
  progressPercent: number;
  barColorClass: string;
}

const POPULAR_SERVICES: PopularServiceItem[] = [
  {
    id: 'dien',
    name: 'Sửa điện',
    count: 245,
    progressPercent: 96,
    barColorClass: 'bg-[#FF5E14]',
  },
  {
    id: 'vesinh',
    name: 'Vệ sinh',
    count: 198,
    progressPercent: 80,
    barColorClass: 'bg-[#FF5E14]',
  },
  {
    id: 'diennuoc',
    name: 'Điện nước',
    count: 165,
    progressPercent: 68,
    barColorClass: 'bg-[#FF5E14]',
  },
  {
    id: 'dienlanh',
    name: 'Điện lạnh',
    count: 142,
    progressPercent: 58,
    barColorClass: 'bg-[#FDBA74]',
  },
  {
    id: 'suamay',
    name: 'Sửa máy',
    count: 95,
    progressPercent: 38,
    barColorClass: 'bg-[#FED7AA]',
  },
];

export const DashboardPopularServices: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
      {/* HEADER CARD */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Dịch vụ phổ biến
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Theo số lượng đơn
          </p>
        </div>

        <span className="text-xs text-slate-400 font-medium">
          Đơn vị: Đơn hàng
        </span>
      </div>

      {/* DANH SÁCH THANH TIẾN ĐỘ */}
      <div className="mt-5 space-y-4">
        {POPULAR_SERVICES.map((item) => (
          <div key={item.id} className="space-y-1.5">
            {/* TÊN DỊCH VỤ VÀ SỐ ĐƠN */}
            <div className="flex items-center justify-between text-xs sm:text-sm font-semibold">
              <span className="text-slate-800">{item.name}</span>
              <span className="text-slate-900 font-bold">{item.count} đơn</span>
            </div>

            {/* THANH PROGRESS BAR BO GÓC TRÒN */}
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${item.barColorClass}`}
                style={{ width: `${item.progressPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
