import React from 'react';
import { ChevronRight } from 'lucide-react';

interface RecentOrder {
  id: string;
  code: string;
  service: string;
  serviceDotColor: string;
  customer: string;
  time: string;
  status: 'Completed' | 'Processing' | 'Pending';
}

const RECENT_ORDERS: RecentOrder[] = [
  {
    id: '1',
    code: '#1024',
    service: 'Sửa điện gia dụng',
    serviceDotColor: 'bg-[#FF5E14]',
    customer: 'Nguyễn Văn An',
    time: '10 phút trước',
    status: 'Completed',
  },
  {
    id: '2',
    code: '#1023',
    service: 'Vệ sinh máy lạnh',
    serviceDotColor: 'bg-sky-500',
    customer: 'Trần Thị Mai',
    time: '35 phút trước',
    status: 'Processing',
  },
  {
    id: '3',
    code: '#1022',
    service: 'Sửa ống nước rò rỉ',
    serviceDotColor: 'bg-amber-500',
    customer: 'Lê Hoàng Phúc',
    time: '1 giờ trước',
    status: 'Pending',
  },
  {
    id: '4',
    code: '#1021',
    service: 'Sửa bo mạch máy giặt',
    serviceDotColor: 'bg-[#FF5E14]',
    customer: 'Phạm Minh Quân',
    time: '2 giờ trước',
    status: 'Completed',
  },
];

export const DashboardRecentOrders: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      {/* HEADER CARD */}
      <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Đơn hàng gần đây
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Theo dõi tiến độ đơn dịch vụ mới nhất
          </p>
        </div>

        <a
          href="/manage/orders"
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#FF5E14] hover:text-[#e6520f] transition-colors cursor-pointer"
        >
          <span>Xem tất cả đơn hàng</span>
          <ChevronRight className="w-4 h-4 stroke-[2.5]" />
        </a>
      </div>

      {/* BẢNG DỮ LIỆU ĐƠN HÀNG */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
              <th className="py-3 px-6">MÃ ĐƠN</th>
              <th className="py-3 px-6">DỊCH VỤ</th>
              <th className="py-3 px-6">KHÁCH HÀNG</th>
              <th className="py-3 px-6">THỜI GIAN</th>
              <th className="py-3 px-6">TRẠNG THÁI</th>
              <th className="py-3 px-6 text-right">HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm font-medium">
            {RECENT_ORDERS.map((order) => (
              <tr
                key={order.id}
                className="hover:bg-slate-50/70 transition-colors"
              >
                {/* 1. Mã đơn */}
                <td className="py-4 px-6 font-bold text-[#FF5E14]">
                  {order.code}
                </td>

                {/* 2. Dịch vụ (có chấm tròn màu) */}
                <td className="py-4 px-6">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${order.serviceDotColor} shrink-0`}
                    />
                    <span className="font-semibold text-slate-800">
                      {order.service}
                    </span>
                  </div>
                </td>

                {/* 3. Khách hàng */}
                <td className="py-4 px-6 text-slate-700">
                  {order.customer}
                </td>

                {/* 4. Thời gian */}
                <td className="py-4 px-6 text-slate-500 text-xs sm:text-sm">
                  {order.time}
                </td>

                {/* 5. Trạng thái */}
                <td className="py-4 px-6">
                  {order.status === 'Completed' && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Completed
                    </span>
                  )}
                  {order.status === 'Processing' && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                      Processing
                    </span>
                  )}
                  {order.status === 'Pending' && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      Pending
                    </span>
                  )}
                </td>

                {/* 6. Hành động */}
                <td className="py-4 px-6 text-right">
                  <button
                    type="button"
                    className="text-xs sm:text-sm font-semibold text-[#FF5E14] hover:text-[#d94e0f] hover:underline cursor-pointer"
                  >
                    Chi tiết
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
