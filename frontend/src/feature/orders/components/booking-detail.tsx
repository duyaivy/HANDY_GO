
'use client';

import React from 'react';
import {
  X,
  Calendar,
  Clock,
  Phone,
  Star,
  MapPin,
  ImageIcon,
  Play,
} from 'lucide-react';
import { BookingOrderItem } from '../types';

export interface BookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking?: BookingOrderItem | null;
}

const STATUS_LABELS: Record<BookingOrderItem['statusType'], string> = {
  created: 'Mới tạo',
  awaiting_payment: 'Chờ thanh toán',
  confirmed: 'Đã xác nhận',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  disputed: 'Đang tranh chấp',
};

const STATUS_STYLES: Record<BookingOrderItem['statusType'], string> = {
  created: 'bg-slate-50 text-slate-700 border-slate-200',
  awaiting_payment: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-sky-50 text-sky-700 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  disputed: 'bg-purple-50 text-purple-700 border-purple-200',
};

const PAYMENT_LABELS: Record<BookingOrderItem['paymentState'], string> = {
  unpaid: 'Chưa thanh toán',
  pending: 'Đang xử lý',
  paid: 'Đã thanh toán',
  refunded: 'Đã hoàn tiền',
  failed: 'Thanh toán thất bại',
};

const PAYMENT_STYLES: Record<BookingOrderItem['paymentState'], string> = {
  unpaid: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-sky-50 text-sky-700 border-sky-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  refunded: 'bg-purple-50 text-purple-700 border-purple-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Chưa cập nhật';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Chưa cập nhật';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
  }).format(date);
};

const formatPrice = (price: number) =>
  `${price.toLocaleString('vi-VN')}đ`;

const getInitials = (name: string) => {
  if (!name || name === '—') return '--';

  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
};

export const BookingDetailModal: React.FC<BookingDetailModalProps> = ({
  isOpen,
  onClose,
  booking,
}) => {
  if (!isOpen || !booking) return null;

  const hasCraftsman =
    booking.craftsman.trim() !== '' && booking.craftsman !== '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      {/* Lớp nền mờ */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Khung Modal chính */}
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 z-10 overflow-hidden my-auto max-h-[92vh] overflow-y-auto">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Chi tiết Booking
            </h2>

            <span className="inline-block px-2.5 py-0.5 rounded-lg bg-[#FFF4EC] border border-[#FFD9C2] text-[#FF5E14] font-bold text-xs tracking-wide">
              #{booking.code}
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[booking.statusType]}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {STATUS_LABELS[booking.statusType]}
            </span>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng chi tiết booking"
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* THÂN MODAL */}
        <div className="mt-5 space-y-4">
          {/* HÀNG 1: THÔNG TIN ĐƠN HÀNG VÀ NGƯỜI DÙNG */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Thông tin đơn hàng */}
            <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/60 p-4.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3.5">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
                    THÔNG TIN ĐƠN HÀNG
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${PAYMENT_STYLES[booking.paymentState]}`}
                  >
                    {PAYMENT_LABELS[booking.paymentState]}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs sm:text-sm">
                  {/* Ngày tạo đơn */}
                  <div className="flex items-center justify-between gap-3 text-slate-600">
                    <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Ngày đặt</span>
                    </div>

                    <span className="text-right text-slate-800">
                      {formatDate(booking.createdAt)}
                    </span>
                  </div>

                  {/* Lịch hẹn */}
                  <div className="flex items-center justify-between gap-3 text-slate-600">
                    <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                      <Clock className="w-3.5 h-3.5 text-orange-500" />
                      <span>Lịch hẹn</span>
                    </div>

                    <div className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-xs text-slate-800 shadow-2xs text-right">
                      Chưa cập nhật
                    </div>
                  </div>
                </div>
              </div>

              {/* Tổng chi phí */}
              <div className="pt-3.5 mt-3 border-t border-slate-200/70 flex items-baseline justify-between gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  Tổng chi phí thỏa thuận
                </span>

                <span className="text-xl sm:text-2xl font-black text-[#FF5E14] tracking-tight whitespace-nowrap">
                  {formatPrice(booking.price)}
                </span>
              </div>
            </div>

            {/* Thông tin khách hàng và thợ */}
            <div className="space-y-3">
              {/* Khách hàng */}
              <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/60 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
                    KHÁCH HÀNG
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {getInitials(booking.customer)}
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {booking.customer}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium truncate mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>Chưa cập nhật số điện thoại</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thợ tiếp nhận */}
              <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/60 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
                    THỢ TIẾP NHẬN
                  </span>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200">
                    <Star className="w-3 h-3" />
                    Chưa có đánh giá
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center shrink-0">
                    {getInitials(booking.craftsman)}
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {hasCraftsman ? booking.craftsman : 'Chưa có thợ nhận'}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>Chưa cập nhật số điện thoại</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* HÀNG 2: DỊCH VỤ VÀ ĐỊA CHỈ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Dịch vụ */}
            <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/60 p-3.5">
              <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block mb-2">
                DỊCH VỤ YÊU CẦU
              </span>

              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${booking.serviceColorClass}`}
                >
                  {booking.service}
                </span>
              </div>
            </div>

            {/* Địa chỉ */}
            <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/60 p-3.5">
              <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block mb-2">
                ĐỊA CHỈ THỰC HIỆN
              </span>

              <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Chưa cập nhật địa chỉ</span>
              </div>
            </div>
          </div>

          {/* HÀNG 3: YÊU CẦU VÀ TỆP ĐÍNH KÈM */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
                YÊU CẦU & HÌNH ẢNH ĐÍNH KÈM
              </span>

              <span className="text-xs text-slate-400 font-medium">
                Chưa có dữ liệu
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC]/60 p-3.5 text-sm text-slate-500">
              Chưa có mô tả yêu cầu hoặc tệp đính kèm.
            </div>

            {/* Khung minh họa media, chưa có URL từ API */}
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="rounded-2xl bg-slate-100/90 border border-slate-200/90 h-24 flex flex-col items-center justify-center gap-2 shadow-2xs">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-2xs">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  Chưa có ảnh
                </span>
              </div>

              <div className="rounded-2xl bg-slate-100/90 border border-slate-200/90 h-24 flex flex-col items-center justify-center gap-2 shadow-2xs">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-2xs">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  Chưa có ảnh
                </span>
              </div>

              <div className="rounded-2xl bg-slate-100/90 border border-slate-200/90 h-24 flex flex-col items-center justify-center gap-2 shadow-2xs">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-2xs">
                  <Play className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  Chưa có video
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Trạng thái hiện tại: {STATUS_LABELS[booking.statusType]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingDetailModal;
