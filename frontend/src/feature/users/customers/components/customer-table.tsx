"use client";

import { useEffect, useState } from "react";
import {
  Users,
  UserCheck,
  Ban,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Inbox,
  Copy,
  CalendarDays,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

import type { UserResponse } from "../../types";
import CustomerDetailModal from "./customer-detail";
import { useUsersQuery } from "../../hooks/use-users";

const PAGE_SIZE = 10;
const SKELETON_ROWS = 5;

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

const STATUS_LABELS: Record<string, string> = {
  active: "Đang hoạt động",
  inactive: "Ngừng hoạt động",
  suspended: "Tạm khóa",
  deleted: "Đã xóa",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  suspended: "bg-rose-50 text-rose-700",
  deleted: "bg-slate-100 text-slate-500",
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN");
}

function CustomerAvatar({ customer }: { customer: UserResponse }) {
  const [imageError, setImageError] = useState(false);
  const name = customer.fullName || "Khách hàng";

  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-sm font-semibold text-[#FF5E14]">
      {customer.avatarUrl && !imageError ? (
        <img
          src={customer.avatarUrl}
          alt={name}
          onError={() => setImageError(true)}
          className="size-full object-cover"
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

function CustomerStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium sm:text-[12px] ${
        STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DetailButton({
  onClick,
  mobile = false,
}: {
  onClick: () => void;
  mobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center justify-center border border-slate-200 bg-white font-semibold text-slate-700 transition-colors duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF5E14] ${FOCUS_RING} ${
        mobile
          ? "h-9 gap-1 rounded-lg px-3.5 text-[13px]"
          : "h-7 gap-0.5 rounded-md px-2 text-[11px] lg:px-2.5 lg:text-[12px]"
      }`}
    >
      <span>Chi tiết</span>
      <ChevronRight
        className={mobile ? "size-3.5" : "size-3"}
        strokeWidth={2}
      />
    </button>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number | string;
  description: string;
  icon: typeof Users;
  tone: "orange" | "green" | "rose";
}) {
  const colors = {
    orange: {
      value: "text-slate-900",
      icon: "bg-orange-50 text-[#FF5E14]",
    },
    green: {
      value: "text-emerald-600",
      icon: "bg-emerald-50 text-emerald-600",
    },
    rose: {
      value: "text-rose-600",
      icon: "bg-rose-50 text-rose-600",
    },
  }[tone];

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-500">{title}</p>

        <p
          className={`mt-2 text-[26px] font-semibold tabular-nums ${colors.value}`}
        >
          {value}
        </p>

        <p className="mt-1 text-[12px] text-slate-400">{description}</p>
      </div>

      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}
      >
        <Icon size={21} strokeWidth={1.8} />
      </div>
    </div>
  );
}

function CopyUserId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Sao chép User ID: ${id}`}
      aria-label={`Sao chép User ID ${id}`}
      className={`inline-flex max-w-full items-center gap-1.5 text-left text-[12px] text-[#64748B] transition-colors hover:text-[#FF5E14] ${FOCUS_RING}`}
    >
      <span className="truncate">User ID: {id.slice(0, 8)}…</span>
      <Copy className="h-3.5 w-3.5 shrink-0" />
      {copied && <span className="shrink-0 text-emerald-600">Đã sao chép</span>}
    </button>
  );
}

export function CustomerTable() {
  // FILTER STATES
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);

  // DETAIL MODAL STATE
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );

  // SEARCH DEBOUNCE
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // QUERY PARAMS
  const query = {
    role: "customer" as const,
    page: currentPage,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  };

  // API
  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useUsersQuery(query);

  // HTTP WRAPPER: { status, payload }
  const customers: UserResponse[] = response?.payload.data ?? [];

  const pagination = response?.payload.pagination;

  const total = pagination?.total ?? 0;

  const totalPages = Math.max(1, pagination?.totalPages ?? 1);

  // THỐNG KÊ TRONG TRANG HIỆN TẠI
  const activeCount = customers.filter(
    (customer) => customer.status === "active",
  ).length;

  const suspendedCount = customers.filter(
    (customer) => customer.status === "suspended",
  ).length;

  // PAGINATION - GIỐNG ORDER
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const visiblePages: (number | "ellipsis-left" | "ellipsis-right")[] = [];

  const windowSize = 5;

  const start = Math.max(
    1,
    Math.min(
      safeCurrentPage - Math.floor(windowSize / 2),
      totalPages - windowSize + 1,
    ),
  );

  const end = Math.min(totalPages, start + windowSize - 1);

  const pageNumbers = new Set<number>([1, totalPages]);

  for (let pageNumber = start; pageNumber <= end; pageNumber++) {
    pageNumbers.add(pageNumber);
  }

  const sortedPages = [...pageNumbers].sort((a, b) => a - b);

  for (let index = 0; index < sortedPages.length; index++) {
    const pageNumber = sortedPages[index];
    const previous = sortedPages[index - 1];

    if (previous !== undefined && pageNumber - previous === 2) {
      visiblePages.push(previous + 1);
    } else if (previous !== undefined && pageNumber - previous > 2) {
      visiblePages.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    }

    visiblePages.push(pageNumber);
  }

  // HANDLERS
  const openDetail = (id: string) => {
    setSelectedCustomerId(id);
  };

  const closeDetail = () => {
    setSelectedCustomerId(null);
  };

  const changePage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    id: string,
  ) => {
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(id);
    }
  };

  const handleCardKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    id: string,
  ) => {
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(id);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4 font-['Inter',sans-serif] leading-[1.6] text-[#0F172A] antialiased">
      {/* HEADER */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A] sm:text-[24px]">
          Quản lý khách hàng
        </h1>

        <p className="mt-1 text-[14px] text-[#64748B]">
          Theo dõi và quản lý tài khoản khách hàng trên hệ thống HandyGo
        </p>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          title="Tổng khách hàng"
          value={isLoading || isError ? "—" : total}
          description="Theo bộ lọc hiện tại"
          icon={Users}
          tone="orange"
        />

        <SummaryCard
          title="Đang hoạt động"
          value={isLoading || isError ? "—" : activeCount}
          description="Trong trang hiện tại"
          icon={UserCheck}
          tone="green"
        />

        <SummaryCard
          title="Tạm khóa"
          value={isLoading || isError ? "—" : suspendedCount}
          description="Trong trang hiện tại"
          icon={Ban}
          tone="rose"
        />
      </div>

      {/* CONTENT */}
      <div className="relative overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 p-4 sm:p-5">
          {/* TITLE + RESET */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-[#0F172A]">
                Danh sách khách hàng
              </h2>

              <p className="mt-1 text-[12px] text-[#64748B]">
                {total} khách hàng phù hợp
              </p>
            </div>

            <button
              type="button"
              disabled={isFetching}
              onClick={() => {
                setSearchTerm("");
                setDebouncedSearch("");
                setStatusFilter("all");
                setCurrentPage(1);
              }}
              className="text-[13px] font-medium text-slate-500 transition-colors hover:text-[#FF5E14] disabled:opacity-50"
            >
              Xóa lọc
            </button>
          </div>

          {/* FILTERS */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px_40px]">
            <div className="relative min-w-0">
              <Search
                size={16}
                className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm theo tên hoặc User ID đầy đủ..."
                className={`h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white pr-3 pl-10 text-[13px] text-[#0F172A] placeholder:text-slate-400 outline-none transition-colors focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] ${FOCUS_RING}`}
              />
            </div>

            <div className="relative min-w-0">
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setCurrentPage(1);
                }}
                className={`h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pr-8 pl-3 text-[13px] text-[#0F172A] outline-none transition-colors focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] ${FOCUS_RING}`}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang hoạt động</option>
                <option value="suspended">Tạm khóa</option>
                <option value="deleted">Đã xóa</option>
              </select>

              <ChevronDown
                size={16}
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400"
              />
            </div>

            <button
              type="button"
              title="Làm mới danh sách"
              aria-label="Làm mới danh sách"
              disabled={isFetching}
              onClick={() => void refetch()}
              className={`flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:text-[#FF5E14] disabled:opacity-50 ${FOCUS_RING}`}
            >
              <RefreshCw
                size={16}
                className={isFetching ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        {/* ERROR */}
        {isError ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <AlertCircle size={30} className="text-rose-500" />

            <p className="text-[14px] text-red-600">
              {error instanceof Error
                ? error.message
                : "Không thể tải danh sách khách hàng"}
            </p>

            <button
              type="button"
              onClick={() => void refetch()}
              className="text-[13px] font-semibold text-[#FF5E14] hover:text-orange-700"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <>
            {/* MOBILE: CARD */}
            <div className="px-3 pb-4 md:hidden">
              {isLoading ? (
                <ul className="space-y-3">
                  {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                    <li
                      key={index}
                      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-10 rounded-full" />

                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-2/3" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>

                      <Skeleton className="h-14 w-full rounded-xl" />
                      <Skeleton className="ml-auto h-9 w-24" />
                    </li>
                  ))}
                </ul>
              ) : customers.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-400">
                  <Inbox size={30} strokeWidth={1.5} />
                  <p className="text-[14px]">Không tìm thấy khách hàng nào</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {customers.map((customer) => (
                    <li
                      key={customer.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Xem chi tiết khách hàng ${customer.fullName}`}
                      onClick={() => openDetail(customer.id)}
                      onKeyDown={(event) =>
                        handleCardKeyDown(event, customer.id)
                      }
                      className={`cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50/60 active:bg-slate-50 ${FOCUS_RING}`}
                    >
                      <div className="flex items-start gap-3">
                        <CustomerAvatar customer={customer} />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-[#0F172A]">
                            {customer.fullName || "Chưa cập nhật tên"}
                          </p>

                          <div className="mt-1 min-w-0">
                            <CopyUserId id={customer.id} />
                          </div>
                        </div>

                        <CustomerStatusBadge status={customer.status} />
                      </div>

                      <dl className="mt-4 rounded-xl bg-slate-50 px-3">
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <dt className="text-[13px] text-[#64748B]">
                            Ngày tham gia
                          </dt>

                          <dd className="text-[13px] font-medium text-[#0F172A]">
                            {formatDate(customer.createdAt)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex justify-end">
                        <DetailButton
                          mobile
                          onClick={() => openDetail(customer.id)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* DESKTOP: TABLE */}
            <div className="hidden min-w-0 overflow-x-auto overscroll-x-contain md:block">
              <table className="w-full min-w-[650px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[43%]" />
                  <col className="w-[23%]" />
                  <col className="w-[20%]" />
                  <col className="w-[14%]" />
                </colgroup>

                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[12px] font-semibold text-[#0F172A] lg:text-[13px]">
                    <th className="px-5 py-3.5">Khách hàng</th>

                    <th className="px-4 py-3.5">Ngày tham gia</th>

                    <th className="px-4 py-3.5">Trạng thái</th>

                    <th className="px-3 py-3.5 text-center">Thao tác</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-[13px] lg:text-[14px]">
                  {isLoading ? (
                    Array.from({ length: SKELETON_ROWS }, (_, index) => (
                      <tr key={index}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Skeleton className="size-10 rounded-full" />

                            <div className="space-y-2">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <Skeleton className="h-4 w-24" />
                        </td>

                        <td className="px-4 py-4">
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </td>

                        <td className="px-3 py-4">
                          <Skeleton className="mx-auto h-7 w-20" />
                        </td>
                      </tr>
                    ))
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-400">
                          <Inbox size={30} strokeWidth={1.5} />
                          <p className="text-[14px]">
                            Không tìm thấy khách hàng nào
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    customers.map((customer) => (
                      <tr
                        key={customer.id}
                        tabIndex={0}
                        aria-label={`Xem chi tiết khách hàng ${customer.fullName}`}
                        onClick={() => openDetail(customer.id)}
                        onKeyDown={(event) =>
                          handleRowKeyDown(event, customer.id)
                        }
                        className="group cursor-pointer transition-colors hover:bg-slate-50/60 focus-visible:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FF5E14]"
                      >
                        <td className="px-5 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <CustomerAvatar customer={customer} />

                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[#0F172A] lg:text-[14px]">
                                {customer.fullName || "Chưa cập nhật tên"}
                              </p>

                              <div className="mt-1 min-w-0">
                                <CopyUserId id={customer.id} />
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 text-slate-600">
                            <CalendarDays
                              size={15}
                              className="shrink-0 text-slate-400"
                            />

                            {formatDate(customer.createdAt)}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <CustomerStatusBadge status={customer.status} />
                        </td>

                        <td className="px-3 py-4 text-center">
                          <DetailButton
                            onClick={() => openDetail(customer.id)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION: SAME AS ORDER */}
            <div className="border-t border-slate-100 px-3 py-4 sm:px-6">
              <div className="flex flex-col items-center justify-between gap-3 text-[13px] text-[#64748B] xl:flex-row">
                <div className="flex items-center gap-2">
                  <span>· Tổng {total} khách hàng</span>

                  {isFetching && !isLoading && <span>· Đang cập nhật...</span>}
                </div>

                <nav
                  aria-label="Phân trang khách hàng"
                  className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-2"
                >
                  {/* PREVIOUS */}
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1 || isLoading || isFetching}
                    onClick={() => changePage(safeCurrentPage - 1)}
                    className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  {/* PAGE NUMBERS */}
                  {visiblePages.map((pageNumber) =>
                    typeof pageNumber === "number" ? (
                      <button
                        key={pageNumber}
                        type="button"
                        disabled={isLoading || isFetching}
                        onClick={() => changePage(pageNumber)}
                        aria-current={
                          safeCurrentPage === pageNumber ? "page" : undefined
                        }
                        className={`h-10 min-w-10 rounded-xl px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          safeCurrentPage === pageNumber
                            ? "bg-[#FF5E14] text-white shadow-sm"
                            : "bg-white text-slate-900 hover:bg-slate-100"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ) : (
                      <span
                        key={pageNumber}
                        aria-hidden="true"
                        className="flex h-9 min-w-5 items-center justify-center text-sm font-semibold text-slate-900 sm:h-10 sm:min-w-8"
                      >
                        ...
                      </span>
                    ),
                  )}

                  {/* NEXT */}
                  <button
                    type="button"
                    disabled={
                      safeCurrentPage >= totalPages || isLoading || isFetching
                    }
                    onClick={() => changePage(safeCurrentPage + 1)}
                    className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </nav>
              </div>
            </div>
          </>
        )}
      </div>

      {/* EXISTING DETAIL MODAL */}
      <CustomerDetailModal userId={selectedCustomerId} onClose={closeDetail} />
    </div>
  );
}
