import React from 'react';
import {
  Users,
  Megaphone,
  ClipboardList,
  Coins,
  ArrowUp,
} from 'lucide-react';

export interface KpiCardData {
  id: string;
  title: string;
  value: string;
  unit?: string;
  growth: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DEFAULT_KPIS: KpiCardData[] = [
  {
    id: 'customers',
    title: 'KHÁCH HÀNG',
    value: '1,250',
    growth: '+12.5%',
    subtitle: 'So với tháng trước',
    icon: Users,
  },
  {
    id: 'partners',
    title: 'THỢ ĐỐI TÁC',
    value: '320',
    growth: '+8.2%',
    subtitle: 'Đang hoạt động',
    icon: Megaphone,
  },
  {
    id: 'orders',
    title: 'ĐƠN HÀNG',
    value: '845',
    growth: '+15.4%',
    subtitle: 'Tổng đơn trong kỳ',
    icon: ClipboardList,
  },
  {
    id: 'revenue',
    title: 'DOANH THU',
    value: '125.5',
    unit: 'triệu',
    growth: '+10.2%',
    subtitle: 'Tăng trưởng ổn định',
    icon: Coins,
  },
];

export interface DashboardKpiCardsProps {
  data?: KpiCardData[];
}

export const DashboardKpiCards: React.FC<DashboardKpiCardsProps> = ({
  data = DEFAULT_KPIS,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
      {data.map((item) => {
        const IconComponent = item.icon;
        return (
          <div
            key={item.id}
            className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
          >
            {/* HÀNG TRÊN: TIÊU ĐỀ & ICON CAM */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs uppercase font-bold tracking-wider text-slate-400">
                {item.title}
              </span>
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF5E14] shrink-0">
                <IconComponent className="w-4 h-4 stroke-[2.2]" />
              </div>
            </div>

            {/* HÀNG GIỮA: SỐ LIỆU TO & BADGE TĂNG TRƯỞNG XANH */}
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {item.value}
                </span>
                {item.unit && (
                  <span className="text-sm font-bold text-slate-600">
                    {item.unit}
                  </span>
                )}
              </div>

              {/* Badge % tăng trưởng chuẩn như ảnh mẫu */}
              <div className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 shrink-0">
                <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                <span>{item.growth}</span>
              </div>
            </div>

            {/* HÀNG DƯỚI: MÔ TẢ PHỤ */}
            <div className="mt-2 text-xs text-slate-400 font-medium">
              {item.subtitle}
            </div>
          </div>
        );
      })}
    </div>
  );
};
