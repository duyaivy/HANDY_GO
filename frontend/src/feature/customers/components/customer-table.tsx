"use client";

import React, { useState } from "react";
import {
  Users,
  UserCheck,
  Ban,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Edit2,
  Eye,
  Lock,
  Unlock,
} from "lucide-react";

import { CustomerItem, CustomerStatus } from "../types";

// Dữ liệu mẫu khi chưa kết nối API
const DEFAULT_CUSTOMERS: CustomerItem[] = [
  {
    id: "customer-001",
    name: "Nguyễn Văn A",
    avatarUrl:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80",
    email: "a@gmail.com",
    phone: "090xxxxxxx",
    status: "active",
    createdAt: "2026-01-10T08:00:00.000Z",
    updatedAt: "2026-01-10T08:00:00.000Z",
    bio: null,
  },
  {
    id: "customer-002",
    name: "Trần B",
    avatarUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1d7228f2d?w=120&auto=format&fit=crop&q=80",
    email: "b@gmail.com",
    phone: "091xxxxxxx",
    status: "active",
    createdAt: "2026-02-15T08:00:00.000Z",
    updatedAt: "2026-02-15T08:00:00.000Z",
    bio: null,
  },
  {
    id: "customer-003",
    name: "Lê C",
    avatarUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80",
    email: "c@gmail.com",
    phone: "092xxxxxxx",
    status: "suspended",
    createdAt: "2026-03-20T08:00:00.000Z",
    updatedAt: "2026-03-20T08:00:00.000Z",
    bio: null,
  },
  {
    id: "customer-004",
    name: "Phạm Minh D",
    avatarUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80",
    email: "d.pham@gmail.com",
    phone: "093xxxxxxx",
    status: "active",
    createdAt: "2026-04-05T08:00:00.000Z",
    updatedAt: "2026-04-05T08:00:00.000Z",
    bio: null,
  },
  {
    id: "customer-005",
    name: "Hoàng Đức E",
    avatarUrl:
      "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80",
    email: "e.hoang@gmail.com",
    phone: "094xxxxxxx",
    status: "active",
    createdAt: "2026-05-12T08:00:00.000Z",
    updatedAt: "2026-05-12T08:00:00.000Z",
    bio: null,
  },
];

export interface CustomerTableProps {
  customers?: CustomerItem[];
}

const STATUS_LABELS: Record<CustomerStatus, string> = {
  active: "Đang hoạt động",
  suspended: "Tạm khóa",
  deleted: "Đã xóa",
};

export const CustomerTable: React.FC<CustomerTableProps> = ({
  customers: initialCustomers = DEFAULT_CUSTOMERS,
}) => {
  const [customerList, setCustomerList] =
    useState<CustomerItem[]>(initialCustomers);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CustomerStatus>(
    "all",
  );
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 5;

  // Quản lý modal chi tiết và chỉnh sửa
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerItem | null>(null);
  const [editingCustomer, setEditingCustomer] =
    useState<CustomerItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const toggleMenu = (id: string) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  };

  const handleOpenDetail = (customer: CustomerItem) => {
    setSelectedCustomer(customer);
    setIsDetailOpen(true);
    setOpenMenuId(null);
  };

  const handleOpenEdit = (customer: CustomerItem) => {
    setEditingCustomer(customer);
    setIsEditOpen(true);
    setOpenMenuId(null);
  };

  // Chỉ cập nhật state trên giao diện, chưa lưu xuống database
  const handleSaveCustomer = (updated: CustomerItem) => {
    setCustomerList((prev) =>
      prev.map((customer) =>
        customer.id === updated.id ? updated : customer,
      ),
    );

    setEditingCustomer(updated);
    setIsEditOpen(false);
  };

  // Đổi trạng thái cục bộ, chưa gọi API
  const handleToggleStatus = (id: string) => {
    setCustomerList((prev) =>
      prev.map((customer) => {
        if (customer.id !== id) return customer;

        const nextStatus: CustomerStatus =
          customer.status === "active" ? "suspended" : "active";

        return {
          ...customer,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        };
      }),
    );

    setOpenMenuId(null);
  };

  const filteredCustomers = customerList.filter((customer) => {
    const keyword = searchTerm.trim().toLowerCase();

    const matchesSearch =
      customer.name.toLowerCase().includes(keyword) ||
      customer.id.toLowerCase().includes(keyword) ||
      (customer.email ?? "").toLowerCase().includes(keyword) ||
      (customer.phone ?? "").toLowerCase().includes(keyword);

    const matchesStatus =
      statusFilter === "all" || customer.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / pageSize),
  );

  const safePage = Math.min(currentPage, totalPages);

  const paginatedCustomers = filteredCustomers.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const activeCount = customerList.filter(
    (customer) => customer.status === "active",
  ).length;

  const suspendedCount = customerList.filter(
    (customer) => customer.status === "suspended",
  ).length;

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div>
        <h1 className="text-2xl sm:text-[26px] font-black text-slate-900 tracking-tight">
          Quản lý khách hàng
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Quản lý tài khoản khách hàng trên hệ thống
        </p>
      </div>

      {/* 2. Thống kê */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-slate-600 block">
              Tổng khách
            </span>
            <span className="text-3xl font-black text-slate-900 tracking-tight mt-1 block">
              {customerList.length}
            </span>
            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Khách hàng trong dữ liệu hiện tại
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FFF9EC] border border-[#FDE68A] text-[#F59E0B] flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 stroke-[2.2]" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-slate-600 block">
              Đang hoạt động
            </span>
            <span className="text-3xl font-black text-emerald-600 tracking-tight mt-1 block">
              {activeCount}
            </span>
            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Tài khoản bình thường
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#10B981] flex items-center justify-center shrink-0">
            <UserCheck className="w-6 h-6 stroke-[2.2]" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-slate-600 block">
              Tạm khóa
            </span>
            <span className="text-3xl font-black text-rose-500 tracking-tight mt-1 block">
              {suspendedCount}
            </span>
            <span className="text-xs text-slate-400 font-medium mt-1 block">
              Tài khoản bị tạm ngưng
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FFF1F2] border border-[#FECDD3] text-[#F43F5E] flex items-center justify-center shrink-0">
            <Ban className="w-6 h-6 stroke-[2.2]" />
          </div>
        </div>
      </div>

      {/* 3. Tìm kiếm và lọc */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-lg">
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
            placeholder="Tìm tên, email, SĐT..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200/90 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:ring-3 focus:ring-orange-500/15 transition-all shadow-2xs font-normal"
          />
        </div>

        <div className="relative min-w-47.5 self-end sm:self-auto">
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as "all" | CustomerStatus);
              setCurrentPage(1);
            }}
            className="w-full appearance-none pl-4 pr-9 py-2.5 bg-white border border-slate-200/90 rounded-xl text-sm text-slate-700 font-medium focus:outline-none focus:border-orange-500 cursor-pointer shadow-2xs"
          >
            <option value="all">Trạng thái: Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="suspended">Tạm khóa</option>
            <option value="deleted">Đã xóa</option>
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* 4. Bảng khách hàng */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Danh sách khách hàng
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 border border-orange-200 text-[#FF5E14]">
              {filteredCustomers.length} khách
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
                <th className="py-4 px-6">Khách hàng</th>
                <th className="py-4 px-6">Email</th>
                <th className="py-4 px-6">Số điện thoại</th>
                <th className="py-4 px-6">Trạng thái</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-sm font-medium">
              {paginatedCustomers.map((customer) => {
                const isMenuOpen = openMenuId === customer.id;

                return (
                  <tr
                    key={customer.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 shadow-2xs shrink-0 bg-slate-100">
                          {customer.avatarUrl ? (
                            <img
                              src={customer.avatarUrl}
                              alt={customer.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-slate-500">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="font-bold text-slate-900">
                            {customer.name}
                          </div>
                          <div className="text-xs text-slate-400 font-normal mt-0.5">
                            ID: {customer.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6 text-slate-700 font-medium">
                      {customer.email || "Chưa cập nhật"}
                    </td>

                    <td className="py-4 px-6 text-slate-600 font-mono text-xs sm:text-sm">
                      {customer.phone || "Chưa cập nhật"}
                    </td>

                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                          customer.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : customer.status === "suspended"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            customer.status === "active"
                              ? "bg-emerald-500"
                              : customer.status === "suspended"
                                ? "bg-rose-500"
                                : "bg-slate-400"
                          }`}
                        />
                        {STATUS_LABELS[customer.status]}
                      </span>
                    </td>

                    <td className="py-4 px-6 text-right relative">
                      <button
                        type="button"
                        onClick={() => toggleMenu(customer.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-6 top-10 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 text-left">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(customer)}
                            className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>Chi tiết hồ sơ</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(customer)}
                            className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Chỉnh sửa</span>
                          </button>

                          {customer.status !== "deleted" && (
                            <>
                              <div className="border-t border-slate-100 my-1" />
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleStatus(customer.id)
                                }
                                className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                                  customer.status === "active"
                                    ? "text-rose-600 hover:bg-rose-50"
                                    : "text-emerald-600 hover:bg-emerald-50"
                                }`}
                              >
                                {customer.status === "active" ? (
                                  <>
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Khóa tài khoản</span>
                                  </>
                                ) : (
                                  <>
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>Mở khóa</span>
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {paginatedCustomers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-sm text-slate-400"
                  >
                    Không tìm thấy khách hàng phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Phân trang */}
        <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Hiển thị{" "}
            <strong className="text-slate-800">
              {filteredCustomers.length === 0
                ? 0
                : (safePage - 1) * pageSize + 1}
              {" đến "}
              {Math.min(safePage * pageSize, filteredCustomers.length)}
            </strong>{" "}
            trong tổng số{" "}
            <strong className="text-slate-800">
              {filteredCustomers.length}
            </strong>{" "}
            khách
          </div>

          <div className="flex items-center gap-1.5 select-none self-end sm:self-auto">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer shadow-2xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                    safePage === page
                      ? "bg-[#FF5E14] text-white shadow-xs"
                      : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
                  }`}
                >
                  {page}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer shadow-2xs"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerTable;