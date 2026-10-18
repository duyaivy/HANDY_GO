import React from "react";

interface StatusItem {
  id: string;
  label: string;
  percent: number;
  color: string;
  badgeDotClass: string;
}

const STATUS_ITEMS: StatusItem[] = [
  {
    id: "completed",
    label: "Completed",
    percent: 62,
    color: "#FF5E14",
    badgeDotClass: "bg-[#FF5E14]",
  },
  {
    id: "processing",
    label: "Processing",
    percent: 18,
    color: "#FB923C",
    badgeDotClass: "bg-[#FB923C]",
  },
  {
    id: "pending",
    label: "Pending",
    percent: 12,
    color: "#FCD34D",
    badgeDotClass: "bg-[#FCD34D]",
  },
  {
    id: "cancelled",
    label: "Cancelled",
    percent: 8,
    color: "#94A3B8",
    badgeDotClass: "bg-[#94A3B8]",
  },
];

export const DashboardOrderStatusDonut: React.FC = () => {
  const total = 845;
  const radius = 68;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
      {/* HEADER CARD */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Trạng thái đơn
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Tỷ lệ hoàn thành và xử lý
          </p>
        </div>

        <span className="px-3 py-1 rounded-full text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200">
          Tháng hiện tại
        </span>
      </div>

      {/* THÂN CARD: DONUT VÀ CHÚ THÍCH */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-around gap-6">
        {/* VÒNG TRÒN DONUT SVG */}
        <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
          <svg
            className="w-full h-full -rotate-90 transform"
            viewBox="0 0 180 180"
          >
            {/* Vòng nền xám mờ */}
            <circle
              cx="90"
              cy="90"
              r={radius}
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
              fill="transparent"
            />

            {/* Các phân đoạn trạng thái */}
            {STATUS_ITEMS.map((item, index) => {
              const strokeDasharray = `${
                (item.percent / 100) * circumference
              } ${circumference}`;

              // Tính tổng phần trăm của các phần tử đứng trước
              const accumulatedPercent = STATUS_ITEMS.slice(0, index).reduce(
                (sum, currentItem) => sum + currentItem.percent,
                0,
              );

              const strokeDashoffset = -(
                (accumulatedPercent / 100) *
                circumference
              );

              return (
                <circle
                  key={item.id}
                  cx="90"
                  cy="90"
                  r={radius}
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>

          {/* SỐ LIỆU TỔNG Ở CHÍNH GIỮA */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
              {total}
            </span>

            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">
              TỔNG ĐƠN
            </span>
          </div>
        </div>

        {/* DANH SÁCH CHÚ THÍCH BÊN PHẢI */}
        <div className="flex-1 w-full max-w-[220px] space-y-3">
          {STATUS_ITEMS.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between text-xs sm:text-sm"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${item.badgeDotClass}`}
                />

                <span className="font-medium text-slate-600">{item.label}</span>
              </div>

              <span className="font-extrabold text-slate-900">
                {item.percent}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
