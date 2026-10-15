
import React, { useState } from "react";
import {
  X,
  Wrench,
  Sun,
  Settings,
  Gauge,
  Zap,
  Power,
  Snowflake,
  MoreHorizontal,
} from "lucide-react";
import { CategoryItem } from "../types";

export interface DetailCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: CategoryItem | null;
}

// Dữ liệu dịch vụ mẫu.
// Khi tích hợp API, thay danh sách này bằng các dịch vụ thuộc category.id.
const SAMPLE_SERVICES = [
  { id: "1", name: "Sửa điện", icon: Wrench },
  { id: "2", name: "Lắp điện", icon: Sun },
  { id: "3", name: "Bảo trì", icon: Settings },
  { id: "4", name: "Kiểm tra", icon: Gauge },
  { id: "5", name: "Sửa dây", icon: Zap },
  { id: "6", name: "Lắp ổ điện", icon: Power },
  { id: "7", name: "Điện lạnh", icon: Snowflake },
  { id: "8", name: "...", icon: MoreHorizontal },
];

export const DetailCatalogModal: React.FC<DetailCatalogModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const [imageError, setImageError] = useState(false);

  if (!isOpen || !category) return null;

  // Định dạng ngày theo kiểu Việt Nam.
  const formatDate = (date?: string | null) => {
    if (!date) return "—";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleDateString("vi-VN");
  };

  const createdAt = formatDate(category.createdAt);
  const updatedAt = formatDate(category.updatedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      {/* Lớp nền mờ */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Khung modal chi tiết danh mục */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-150 z-10 my-auto max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            Chi tiết danh mục
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết danh mục"
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NỘI DUNG CHÍNH */}
        <div className="mt-5 space-y-5">
          {/* PHẦN 1: HÌNH ẢNH VÀ THÔNG TIN TỔNG QUAN */}
          <div className="flex items-start gap-4">
            {/* Hình ảnh danh mục */}
            <div className="shrink-0">
              <span className="text-xs text-slate-400 font-medium block mb-1.5">
                Hình ảnh
              </span>

              <div className="w-[88px] h-[88px] rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5 overflow-hidden shadow-sm p-1">
                {category.imageUrl && !imageError ? (
                  <img
                    src={category.imageUrl}
                    alt={category.name}
                    onError={() => setImageError(true)}
                    className="w-full h-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-[#FF5E14] font-bold text-xl">
                    {category.name.charAt(0).toUpperCase() || "⚡"}
                  </div>
                )}
              </div>
            </div>

            {/* Tên, trạng thái và mô tả */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-black text-slate-900 break-words">
                  {category.name}
                </h3>

                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                    category.isActive
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      category.isActive ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />

                  <span>{category.isActive ? "Active" : "Disabled"}</span>
                </span>
              </div>

              <div className="mt-2.5">
                <span className="text-xs text-slate-400 font-medium block mb-1">
                  Mô tả
                </span>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  {category.description || "Chưa có mô tả"}
                </div>
              </div>
            </div>
          </div>

          {/* PHẦN 2: DỊCH VỤ TRONG DANH MỤC */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-3">
              Dịch vụ trong danh mục{" "}
              <span className="text-[#FF5E14]">({category.servicesCount})</span>
            </h4>

            {/* Lưới dịch vụ 4 cột */}
            <div className="grid grid-cols-4 gap-2.5">
              {SAMPLE_SERVICES.map((serv) => {
                const IconComponent = serv.icon;

                return (
                  <div
                    key={serv.id}
                    className="flex flex-col items-center gap-1.5 text-center group"
                  >
                    <div className="w-full aspect-square rounded-2xl border border-slate-200/80 bg-slate-50/60 flex flex-col items-center justify-center gap-1 shadow-sm group-hover:border-orange-300 group-hover:bg-orange-50/30 transition-colors">
                      <IconComponent className="w-5 h-5 text-orange-500 stroke-[2.2]" />

                      <span className="text-[9px] font-bold text-slate-400">
                        IMAGE
                      </span>
                    </div>

                    <span className="text-xs font-semibold text-slate-700 truncate w-full">
                      {serv.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* FOOTER: NGÀY TẠO, CẬP NHẬT VÀ NÚT ĐÓNG */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              Tạo: <strong className="text-slate-800">{createdAt}</strong>
            </span>

            <span>
              Cập nhật: <strong className="text-slate-800">{updatedAt}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="self-end sm:self-auto px-5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default DetailCatalogModal;
