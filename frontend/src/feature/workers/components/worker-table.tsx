
"use client";

import React, { useState } from "react";
import {
  Users,
  Gauge,
  Lock,
  Unlock,
  Search,
  Star,
  MoreVertical,
  ChevronDown,
  Eye,
} from "lucide-react";

import { WorkerItem, WorkerStatus } from "../types";

const AVATAR_COLORS = [
  "bg-slate-200/90 text-slate-600",
  "bg-[#FFEDD5] text-[#C2410C]",
  "bg-[#F3E8FF] text-[#7E22CE]",
  "bg-[#D1FAE5] text-[#047857]",
  "bg-[#FFE4E6] text-[#BE123C]",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Sửa điện":
    "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]",
  "Vệ sinh":
    "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]",
  "Điện lạnh":
    "bg-[#ECFEFF] text-[#0284C7] border-[#BAE6FD]",
  "Sửa máy":
    "bg-[#EEF2FF] text-[#4F46E5] border-[#C7D2FE]",
};

const DEFAULT_CATEGORY_COLOR =
  "bg-slate-50 text-slate-600 border-slate-200";

const WORKER_STATUS_LABELS: Record<WorkerStatus, string> = {
  draft: "Bản nháp",
  pending_kyc: "Chờ xác minh KYC",
  under_review: "Đang xét duyệt",
  verified: "Đã xác minh",
  rejected: "Bị từ chối",
  suspended: "Tạm ngừng",
};

const WORKER_STATUS_COLORS: Record<WorkerStatus, string> = {
  draft: "bg-slate-50 text-slate-600 border-slate-200",
  pending_kyc: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-blue-50 text-blue-700 border-blue-200",
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
};


const DEFAULT_WORKERS: WorkerItem[] = [
  {
    id: "worker-001",
    userId: "user-001",
    name: "Nguyễn Văn A",
    userStatus: "active",
    status: "verified",
    rating: 4.8,
    ratingCount: 52,
    completedOrders: 118,
    totalOrders: 125,
    createdAt: "2026-01-10",
    serviceCategories: ["Sửa điện"],
    kycStatus: "approved",
  },
  {
    id: "worker-002",
    userId: "user-002",
    name: "Trần Thị B",
    userStatus: "active",
    status: "verified",
    rating: 4.6,
    ratingCount: 34,
    completedOrders: 82,
    totalOrders: 90,
    createdAt: "2026-02-12",
    serviceCategories: ["Vệ sinh"],
    kycStatus: "approved",
  },
  {
    id: "worker-003",
    userId: "user-003",
    name: "Lê Văn C",
    userStatus: "active",
    status: "under_review",
    rating: 4.1,
    ratingCount: 15,
    completedOrders: 39,
    totalOrders: 45,
    createdAt: "2026-03-05",
    serviceCategories: ["Điện lạnh"],
    kycStatus: "reviewing",
  },
  {
    id: "worker-004",
    userId: "user-004",
    name: "Phạm Minh D",
    userStatus: "active",
    status: "pending_kyc",
    rating: 4.5,
    ratingCount: 20,
    completedOrders: 145,
    totalOrders: 150,
    createdAt: "2026-04-08",
    serviceCategories: ["Sửa máy", "Sửa điện"],
    kycStatus: "submitted",
  },
  {
    id: "worker-005",
    userId: "user-005",
    name: "Vũ Thị F",
    userStatus: "suspended",
    status: "suspended",
    rating: 4.9,
    ratingCount: 61,
    completedOrders: 68,
    totalOrders: 70,
    createdAt: "2026-05-15",
    serviceCategories: ["Vệ sinh"],
    kycStatus: "approved",
  },
];



const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0][0] + words[words.length - 1][0]
  ).toUpperCase();
};

const getAvatarColor = (id: string) => {
  const hash = Array.from(id).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const getCategoryColor = (category: string) =>
  CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;


export interface WorkerTableProps {
  workers?: WorkerItem[];
}

export const WorkerTable: React.FC<WorkerTableProps> = ({
  workers: initialWorkers = DEFAULT_WORKERS,
}) => {
  const [workersList, setWorkersList] =
    useState<WorkerItem[]>(initialWorkers);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const toggleMenu = (id: string) => {
    setOpenMenuId((previous) => (previous === id ? null : id));
  };

  // Demo thao tác tại giao diện.
  // Khi kết nối API, cần gọi API cập nhật trạng thái thay vì chỉ sửa state.
  const handleToggleStatus = (worker: WorkerItem) => {
    const nextStatus: WorkerStatus =
      worker.status === "suspended" ? "verified" : "suspended";

    setWorkersList((previous) =>
      previous.map((item) =>
        item.id === worker.id
          ? {
              ...item,
              status: nextStatus,
              userStatus:
                nextStatus === "suspended" ? "suspended" : "active",
            }
          : item,
      ),
    );

    setOpenMenuId(null);
  };

  const totalCount = workersList.length;

  const verifiedCount = workersList.filter(
    (worker) => worker.status === "verified",
  ).length;

  const pendingCount = workersList.filter(
    (worker) =>
      worker.status === "pending_kyc" ||
      worker.status === "under_review",
  ).length;

  const filteredWorkers = workersList.filter((worker) => {
    const keyword = searchTerm.trim().toLowerCase();

    const matchesSearch =
      worker.name.toLowerCase().includes(keyword) ||
      worker.id.toLowerCase().includes(keyword) ||
      (worker.code?.toLowerCase().includes(keyword) ?? false) ||
      (worker.phone?.includes(keyword) ?? false);

    const matchesStatus =
      statusFilter === "all" || worker.status === statusFilter;

    const matchesCategory =
      categoryFilter === "all" ||
      worker.serviceCategories.includes(categoryFilter);

    const matchesArea =
      areaFilter === "all" || worker.area === areaFilter;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesCategory &&
      matchesArea
    );
  });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl sm:text-[26px] font-black text-slate-900 tracking-tight">
          Quản lý thợ
        </h1>

        <p className="text-sm text-slate-500 mt-1">
          Quản lý danh sách, hồ sơ xác minh và trạng thái thợ đối tác
          trong hệ thống
        </p>
      </div>

      {/* 3 THẺ THỐNG KÊ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase block">
              TỔNG SỐ THỢ
            </span>

            <span className="text-3xl font-black text-slate-900 tracking-tight mt-1.5 block">
              {totalCount}
            </span>

            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Hồ sơ thợ trong danh sách
            </span>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-[#FFF7ED] border border-[#FFEDD5] text-[#EA580C] flex items-center justify-center shrink-0 shadow-2xs">
            <Users className="w-5.5 h-5.5 stroke-[2.2]" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase block">
              ĐÃ XÁC MINH
            </span>

            <span className="text-3xl font-black text-emerald-500 tracking-tight mt-1.5 block">
              {verifiedCount}
            </span>

            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Hồ sơ đã được xác minh
            </span>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] border border-[#D1FAE5] text-[#10B981] flex items-center justify-center shrink-0 shadow-2xs">
            <Gauge className="w-5.5 h-5.5 stroke-[2.2]" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase block">
              CHỜ XỬ LÝ
            </span>

            <span className="text-3xl font-black text-[#F43F5E] tracking-tight mt-1.5 block">
              {pendingCount}
            </span>

            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Chờ KYC hoặc đang xét duyệt
            </span>
          </div>

          <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] border border-[#FFE4E6] text-[#F43F5E] flex items-center justify-center shrink-0 shadow-2xs">
            <Lock className="w-5.5 h-5.5 stroke-[2.2]" />
          </div>
        </div>
      </div>

      {/* TÌM KIẾM VÀ BỘ LỌC */}
      <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-60">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <Search className="w-4 h-4" />
          </div>

          <input
            type="text"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm tên hoặc ID thợ..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50/60 border border-slate-200/90 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white focus:ring-3 focus:ring-orange-500/15 transition-all font-normal"
          />
        </div>

        <div className="relative min-w-45">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full appearance-none pl-3.5 pr-8 py-2 bg-slate-50/60 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer transition-all"
          >
            <option value="all">Trạng thái: Tất cả</option>
            <option value="draft">Bản nháp</option>
            <option value="pending_kyc">Chờ xác minh KYC</option>
            <option value="under_review">Đang xét duyệt</option>
            <option value="verified">Đã xác minh</option>
            <option value="rejected">Bị từ chối</option>
            <option value="suspended">Tạm ngừng</option>
          </select>

          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative min-w-40">
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full appearance-none pl-3.5 pr-8 py-2 bg-slate-50/60 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer transition-all"
          >
            <option value="all">Ngành nghề: Tất cả</option>
            <option value="Sửa điện">Sửa điện</option>
            <option value="Vệ sinh">Vệ sinh</option>
            <option value="Điện lạnh">Điện lạnh</option>
            <option value="Sửa máy">Sửa máy</option>
          </select>

          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="relative min-w-37.5">
          <select
            value={areaFilter}
            onChange={(event) => {
              setAreaFilter(event.target.value);
              setCurrentPage(1);
            }}
            className="w-full appearance-none pl-3.5 pr-8 py-2 bg-slate-50/60 border border-slate-200/90 rounded-xl text-xs sm:text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 focus:bg-white cursor-pointer transition-all"
          >
            <option value="all">Khu vực: Tất cả</option>
            <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
            <option value="Hà Nội">Hà Nội</option>
            <option value="Đà Nẵng">Đà Nẵng</option>
          </select>

          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* BẢNG DANH SÁCH THỢ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Danh sách thợ
            </h2>

            <span className="text-xs font-normal text-slate-400">
              ({filteredWorkers.length} thợ)
            </span>
          </div>

          <span className="text-xs text-slate-400">
            Dữ liệu mẫu
          </span>
        </div>

        <div className="overflow-x-auto min-h-90">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                <th className="py-4 px-6">THỢ</th>
                <th className="py-4 px-6">DỊCH VỤ</th>
                <th className="py-4 px-6">ĐÁNH GIÁ</th>
                <th className="py-4 px-6">ĐƠN HOÀN THÀNH</th>
                <th className="py-4 px-6">TRẠNG THÁI</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm font-medium">
              {filteredWorkers.map((worker) => {
                const isMenuOpen = openMenuId === worker.id;

                return (
                  <tr
                    key={worker.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* CỘT THỢ */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {worker.avatarUrl ? (
                          <img
                            src={worker.avatarUrl}
                            alt={worker.name}
                            className="w-9 h-9 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div
                            className={`w-9 h-9 rounded-full ${getAvatarColor(worker.id)} font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs`}
                          >
                            {getInitials(worker.name)}
                          </div>
                        )}

                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                            {worker.name}
                          </div>

                          <div className="text-xs text-slate-400 font-normal mt-0.5">
                            ID: {worker.id}
                            {" • "}
                            {worker.ratingCount} đánh giá
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* CỘT DỊCH VỤ */}
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1.5">
                        {worker.serviceCategories.length > 0 ? (
                          worker.serviceCategories.map((category) => (
                            <span
                              key={category}
                              className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold border ${getCategoryColor(category)}`}
                            >
                              {category}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">
                            Chưa có dịch vụ
                          </span>
                        )}
                      </div>
                    </td>

                    {/* CỘT ĐÁNH GIÁ */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{worker.rating.toFixed(1)}</span>
                      </div>
                    </td>

                    {/* CỘT ĐƠN HOÀN THÀNH */}
                    <td className="py-4 px-6 font-bold text-slate-800">
                      {worker.completedOrders}
                    </td>

                    {/* CỘT TRẠNG THÁI */}
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${WORKER_STATUS_COLORS[worker.status]}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        <span>{WORKER_STATUS_LABELS[worker.status]}</span>
                      </span>
                    </td>

                    {/* MENU THAO TÁC */}
                    <td className="py-4 px-6 text-right relative">
                      <button
                        type="button"
                        onClick={() => toggleMenu(worker.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-6 top-10 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 text-left">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(null)}
                            className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>Xem hồ sơ thợ</span>
                          </button>

                          {worker.status === "verified" ||
                          worker.status === "suspended" ? (
                            <>
                              <div className="border-t border-slate-100 my-1" />

                              <button
                                type="button"
                                onClick={() => handleToggleStatus(worker)}
                                className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                                  worker.status === "verified"
                                    ? "text-rose-600 hover:bg-rose-50"
                                    : "text-emerald-600 hover:bg-emerald-50"
                                }`}
                              >
                                {worker.status === "verified" ? (
                                  <>
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Tạm ngừng thợ</span>
                                  </>
                                ) : (
                                  <>
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>Kích hoạt lại thợ</span>
                                  </>
                                )}
                              </button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredWorkers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-sm text-slate-400"
                  >
                    Không tìm thấy thợ phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PHÂN TRANG - GIAO DIỆN */}
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Hiển thị{" "}
            <span className="font-semibold text-slate-800">
              {filteredWorkers.length > 0 ? 1 : 0}
            </span>{" "}
            đến{" "}
            <span className="font-semibold text-slate-800">
              {filteredWorkers.length}
            </span>{" "}
            trong tổng số{" "}
            <span className="font-semibold text-slate-800">
              {totalCount}
            </span>{" "}
            thợ
          </div>

          <div className="flex items-center gap-1.5 select-none">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() =>
                setCurrentPage((page) => Math.max(1, page - 1))
              }
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
            >
              ← Trước
            </button>

            {[1, 2, 3, 4, 5].map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  currentPage === page
                    ? "bg-[#FF5E14] text-white shadow-xs"
                    : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
                }`}
              >
                {page}
              </button>
            ))}

            <span className="px-1 text-slate-400">...</span>

            <button
              type="button"
              disabled={currentPage >= 5}
              onClick={() =>
                setCurrentPage((page) => Math.min(5, page + 1))
              }
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
            >
              Sau →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerTable;
