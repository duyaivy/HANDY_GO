
'use client';

import React, { useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Eye,
} from 'lucide-react';

import { BookingOrderItem } from '../types';
import { BookingDetailModal } from './booking-detail';

const DEFAULT_BOOKINGS: BookingOrderItem[] = [
  {
    id: '1',
    code: 'BK001',
    customer: 'Nguyễn A',
    craftsman: 'Trần B',
    service: 'Sửa điện',
    serviceColorClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
    price: 350000,
    status: 'Hoàn thành',
    statusType: 'completed',
    paymentState: 'paid',
    createdAt: '2026-10-14T09:00:00',
  },
  {
    id: '2',
    code: 'BK002',
    customer: 'Trần C',
    craftsman: 'Lê D',
    service: 'Vệ sinh',
    serviceColorClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    price: 200000,
    status: 'Đã xác nhận',
    statusType: 'confirmed',
    paymentState: 'pending',
    createdAt: '2026-10-12T10:30:00',
  },
  {
    id: '3',
    code: 'BK003',
    customer: 'Lê D',
    craftsman: 'Nguyễn E',
    service: 'Sửa nước',
    serviceColorClass: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
    price: 450000,
    status: 'Chờ thanh toán',
    statusType: 'awaiting_payment',
    paymentState: 'unpaid',
    createdAt: '2026-10-07T14:00:00',
  },
  {
    id: '4',
    code: 'BK004',
    customer: 'Phạm F',
    craftsman: '—',
    service: 'Điện lạnh',
    serviceColorClass: 'bg-sky-50 text-sky-700 border-sky-200/80',
    price: 500000,
    status: 'Đã hủy',
    statusType: 'cancelled',
    paymentState: 'refunded',
    createdAt: '2026-09-20T08:30:00',
  },
  {
    id: '5',
    code: 'BK005',
    customer: 'Hoàng G',
    craftsman: 'Đặng H',
    service: 'Sửa máy',
    serviceColorClass: 'bg-purple-50 text-purple-700 border-purple-200/80',
    price: 300000,
    status: 'Hoàn thành',
    statusType: 'completed',
    paymentState: 'paid',
    createdAt: '2026-10-13T16:00:00',
  },
];

export interface OrderTableProps {
  bookings?: BookingOrderItem[];
}

const STATUS_LABELS: Record<BookingOrderItem['statusType'], string> = {
  created: 'Mới tạo',
  awaiting_payment: 'Chờ thanh toán',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  disputed: 'Đang tranh chấp',
};

const PAYMENT_LABELS: Record<BookingOrderItem['paymentState'], string> = {
  unpaid: 'Chưa thanh toán',
  pending: 'Đang xử lý',
  paid: 'Đã thanh toán',
  refunded: 'Đã hoàn tiền',
  failed: 'Thanh toán thất bại',
};

const STATUS_STYLES: Record<BookingOrderItem['statusType'], string> = {
  created: 'bg-slate-50 text-slate-700 border-slate-200',
  awaiting_payment: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-sky-50 text-sky-700 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  disputed: 'bg-purple-50 text-purple-700 border-purple-200',
};

const SERVICE_FILTERS: Record<string, string> = {
  dien: 'Sửa điện',
  vesinh: 'Vệ sinh',
  nuoc: 'Sửa nước',
  lanh: 'Điện lạnh',
  suamay: 'Sửa máy',
};

const PAGE_SIZE = 5;

const formatPrice = (price: number) =>
  `${price.toLocaleString('vi-VN')}đ`;

const isSameDay = (date: Date, target: Date) =>
  date.getFullYear() === target.getFullYear() &&
  date.getMonth() === target.getMonth() &&
  date.getDate() === target.getDate();

const isThisWeek = (date: Date, now: Date) => {
  const startOfWeek = new Date(now);
  const day = (now.getDay() + 6) % 7;

  startOfWeek.setDate(now.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return date >= startOfWeek && date < endOfWeek;
};

const isThisMonth = (date: Date, now: Date) =>
  date.getFullYear() === now.getFullYear() &&
  date.getMonth() === now.getMonth();

export const OrderTable: React.FC<OrderTableProps> = ({
  bookings = DEFAULT_BOOKINGS,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedBooking, setSelectedBooking] =
    useState<BookingOrderItem | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const resetPage = () => setCurrentPage(1);

  const handleOpenDetail = (bookingItem: BookingOrderItem) => {
    setSelectedBooking(bookingItem);
    setIsDetailModalOpen(true);
    setOpenMenuId(null);
  };

  const toggleMenu = (id: string) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  };

  const now = new Date();

  const filteredBookings = bookings.filter((item) => {
    const keyword = searchTerm.trim().toLowerCase();

    const matchesSearch =
      item.code.toLowerCase().includes(keyword) ||
      item.customer.toLowerCase().includes(keyword) ||
      item.craftsman.toLowerCase().includes(keyword) ||
      item.service.toLowerCase().includes(keyword);

    const matchesStatus =
      statusFilter === 'all' || item.statusType === statusFilter;

    const matchesPayment =
      paymentFilter === 'all' || item.paymentState === paymentFilter;

    const matchesService =
      serviceFilter === 'all' ||
      item.service === SERVICE_FILTERS[serviceFilter];

    const createdDate = new Date(item.createdAt);

    let matchesTime = true;

    if (timeFilter === 'today') {
      matchesTime = isSameDay(createdDate, now);
    } else if (timeFilter === 'week') {
      matchesTime = isThisWeek(createdDate, now);
    } else if (timeFilter === 'month') {
      matchesTime = isThisMonth(createdDate, now);
    }

    return (
      matchesSearch &&
      matchesStatus &&
      matchesPayment &&
      matchesService &&
      matchesTime
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredBookings.length / PAGE_SIZE)
  );

  const safePage = Math.min(currentPage, totalPages);

  const paginatedBookings = filteredBookings.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div>
        <h1 className="text-2xl sm:text-[26px] font-extrabold text-slate-900 tracking-tight">
          Booking Management
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Theo dõi và quản lý các đơn dịch vụ trên hệ thống
        </p>
      </div>

      {/* Thanh tìm kiếm và bộ lọc */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <div className="relative min-w-[220px] max-w-xs flex-1">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </div>

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              resetPage();
            }}
            placeholder="Tìm mã booking, khách hàng hoặc thợ..."
            className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 transition-all shadow-2xs font-normal"
          />
        </div>

        {/* Lọc trạng thái đơn */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              resetPage();
            }}
            className="appearance-none pl-3.5 pr-8 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 cursor-pointer shadow-2xs"
          >
            <option value="all">Trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Lọc thanh toán */}
        <div className="relative">
          <select
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              resetPage();
            }}
            className="appearance-none pl-3.5 pr-8 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 cursor-pointer shadow-2xs"
          >
            <option value="all">Thanh toán</option>
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Lọc dịch vụ */}
        <div className="relative">
          <select
            value={serviceFilter}
            onChange={(e) => {
              setServiceFilter(e.target.value);
              resetPage();
            }}
            className="appearance-none pl-3.5 pr-8 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 cursor-pointer shadow-2xs"
          >
            <option value="all">Dịch vụ</option>
            {Object.entries(SERVICE_FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Lọc thời gian theo created_at */}
        <div className="relative">
          <select
            value={timeFilter}
            onChange={(e) => {
              setTimeFilter(e.target.value);
              resetPage();
            }}
            className="appearance-none pl-3.5 pr-8 py-2.5 bg-white border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 cursor-pointer shadow-2xs"
          >
            <option value="all">Thời gian</option>
            <option value="today">Hôm nay</option>
            <option value="week">Tuần này</option>
            <option value="month">Tháng này</option>
          </select>

          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Bảng booking */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto min-h-[360px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6">MÃ ĐƠN</th>
                <th className="py-4 px-6">KHÁCH HÀNG</th>
                <th className="py-4 px-6">THỢ</th>
                <th className="py-4 px-6">DỊCH VỤ</th>
                <th className="py-4 px-6">GIÁ</th>
                <th className="py-4 px-6">TRẠNG THÁI</th>
                <th className="py-4 px-6 text-right" />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm font-medium">
              {paginatedBookings.map((item) => {
                const isMenuOpen = openMenuId === item.id;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td
                      onClick={() => handleOpenDetail(item)}
                      className="py-4.5 px-6 font-bold text-[#FF5E14] cursor-pointer hover:underline"
                    >
                      {item.code}
                    </td>

                    <td
                      onClick={() => handleOpenDetail(item)}
                      className="py-4.5 px-6 font-semibold text-slate-800 cursor-pointer hover:text-orange-600 transition-colors"
                    >
                      {item.customer}
                    </td>

                    <td className="py-4.5 px-6 text-slate-700">
                      {item.craftsman}
                    </td>

                    <td className="py-4.5 px-6">
                      <span
                        className={`inline-block px-3 py-1 rounded-lg text-xs font-semibold border ${item.serviceColorClass}`}
                      >
                        {item.service}
                      </span>
                    </td>

                    <td className="py-4.5 px-6 font-extrabold text-slate-900">
                      {formatPrice(item.price)}
                    </td>

                    <td className="py-4.5 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[item.statusType]}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {STATUS_LABELS[item.statusType]}
                      </span>
                    </td>

                    <td className="py-4.5 px-6 text-right relative">
                      <button
                        type="button"
                        onClick={() => toggleMenu(item.id)}
                        aria-label={`Thao tác với đơn ${item.code}`}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-6 top-10 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 text-left animate-in fade-in duration-150">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(item)}
                            className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>Chi tiết đơn</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {paginatedBookings.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-sm text-slate-500"
                  >
                    Không tìm thấy đơn booking phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-slate-100 text-xs text-slate-500">
          <span>
            Hiển thị {filteredBookings.length === 0
              ? 0
              : (safePage - 1) * PAGE_SIZE + 1}
            {' – '}
            {Math.min(safePage * PAGE_SIZE, filteredBookings.length)}
            {' / '}
            {filteredBookings.length} đơn
          </span>
        </div>
      </div>

      {/* Phân trang */}
      <div className="flex items-center justify-center gap-2 py-2 select-none">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {Array.from({ length: totalPages }, (_, index) => index + 1).map(
          (page) => (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={`w-8 h-8 rounded-lg font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                safePage === page
                  ? 'bg-[#FF5E14] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() =>
            setCurrentPage((page) => Math.min(totalPages, page + 1))
          }
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Popup chi tiết booking */}
      <BookingDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        booking={selectedBooking}
      />
    </div>
  );
};

export default OrderTable;
