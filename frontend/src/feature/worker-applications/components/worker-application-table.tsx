"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Inbox,
  RefreshCw,
  Search,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useWorkerApplications } from "../hooks/use-worker-applications";
import type {
  WorkerApplication,
  WorkerApplicationSort,
  WorkerApplicationStatus,
} from "../types/type";
import WorkerApplicationDetail from "./worker-application-detail";

const PAGE_SIZE = 10;
const SKELETON_ROWS = 5;
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

const STATUS_LABELS: Record<WorkerApplicationStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
};
const STATUS_COLORS: Record<WorkerApplicationStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN");
}

function WorkerAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-sm font-semibold text-[#FF5E14]">
      {avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        name.charAt(0).toUpperCase() || "?"
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: WorkerApplicationStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium sm:text-[12px] ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function CopyApplicationId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
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
      onClick={(event) => void handleCopy(event)}
      title={`Sao chép mã hồ sơ: ${id}`}
      aria-label={`Sao chép mã hồ sơ ${id}`}
      className={`inline-flex max-w-full items-center gap-1.5 text-left text-[12px] text-[#64748B] transition-colors hover:text-[#FF5E14] ${FOCUS_RING}`}
    >
      <span className="truncate">Mã hồ sơ: {id.slice(0, 8)}…</span>
      <Copy className="size-3.5 shrink-0" />
      {copied && <span className="shrink-0 text-emerald-600">Đã sao chép</span>}
    </button>
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
      className={`inline-flex items-center justify-center border border-slate-200 bg-white font-semibold text-slate-700 transition-colors duration-200 hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF5E14] ${FOCUS_RING} ${mobile ? "h-9 gap-1 rounded-lg px-3.5 text-[13px]" : "h-7 gap-0.5 rounded-md px-2 text-[11px] lg:px-2.5 lg:text-[12px]"}`}
    >
      Chi tiết{" "}
      <ChevronRight
        className={mobile ? "size-3.5" : "size-3"}
        strokeWidth={2}
      />
    </button>
  );
}

function ServiceText({ application }: { application: WorkerApplication }) {
  const services = application.services ?? [];
  return (
    <span
      className="block truncate"
      title={services.map((service) => service.title).join(", ")}
    >
      {services.length
        ? services.map((service) => service.title).join(", ")
        : "—"}
    </span>
  );
}

export default function WorkerApplicationTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    WorkerApplicationStatus | "all"
  >("all");
  const [sortBy, setSortBy] = useState<WorkerApplicationSort>("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedApplicationId, setSelectedApplicationId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(searchTerm.trim()),
      400,
    );
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } =
    useWorkerApplications({
      page: currentPage,
      limit: PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      sortBy,
    });

  const applications: WorkerApplication[] = data?.data ?? [];
  const pagination = data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  // Chỉ điều chỉnh từ dữ liệu thật của truy vấn thành công, tránh dùng
  // placeholder cũ khi truy vấn mới đang tải hoặc bị tạm dừng do mất mạng.
  useEffect(() => {
    if (
      !pagination ||
      isLoading ||
      isFetching ||
      isPlaceholderData ||
      isError ||
      currentPage <= totalPages
    ) return;

    const timer = window.setTimeout(() => {
      setCurrentPage((page) => (page > totalPages ? totalPages : page));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pagination, isLoading, isFetching, isPlaceholderData, isError, currentPage, totalPages]);

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
  for (let number = start; number <= end; number++) pageNumbers.add(number);
  const sortedPages = [...pageNumbers].sort((a, b) => a - b);
  for (let index = 0; index < sortedPages.length; index++) {
    const number = sortedPages[index];
    const previous = sortedPages[index - 1];
    if (previous !== undefined && number - previous === 2)
      visiblePages.push(previous + 1);
    else if (previous !== undefined && number - previous > 2)
      visiblePages.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    visiblePages.push(number);
  }

  const openDetail = (id: string) => setSelectedApplicationId(id);
  const changePage = (page: number) =>
    setCurrentPage(Math.max(1, Math.min(totalPages, page)));
  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    id: string,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(id);
    }
  };
  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLLIElement>,
    id: string,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail(id);
    }
  };
  const resetFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setSortBy("newest");
    setCurrentPage(1);
  };

  return (
    <div className="w-full min-w-0 space-y-4 font-['Inter',sans-serif] leading-[1.6] text-[#0F172A] antialiased">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#0F172A] sm:text-[24px]">
          Xác thực đăng ký làm việc
        </h1>
        <p className="mt-1 text-[14px] text-[#64748B]">
          Theo dõi và xét duyệt hồ sơ đăng ký dịch vụ của thợ trên HandyGo
        </p>
      </div>

      <div className="relative overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-[#0F172A]">
                Danh sách hồ sơ thợ
              </h2>
              <p className="mt-1 text-[12px] text-[#64748B]">
                {total} hồ sơ phù hợp
              </p>
            </div>
            <button
              type="button"
              disabled={isFetching}
              onClick={resetFilters}
              className="text-[13px] font-medium text-slate-500 transition-colors hover:text-[#FF5E14] disabled:opacity-50"
            >
              Xóa lọc
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_185px_150px_40px]">
            <div className="relative w-full min-w-0 sm:max-w-[320px]">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm tên thợ"
                className={`h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-[13px] text-[#0F172A] placeholder:text-slate-400 outline-none transition-colors focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] ${FOCUS_RING}`}
              />
            </div>
            <div className="relative min-w-0">
              <select
                value={statusFilter}
                aria-label="Lọc trạng thái hồ sơ"
                onChange={(event) => {
                  setStatusFilter(
                    event.target.value as WorkerApplicationStatus | "all",
                  );
                  setCurrentPage(1);
                }}
                className={`h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-[13px] text-[#0F172A] outline-none transition-colors focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] ${FOCUS_RING}`}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Đã từ chối</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
            <div className="relative min-w-0">
              <select
                value={sortBy}
                aria-label="Sắp xếp hồ sơ"
                onChange={(event) => {
                  setSortBy(event.target.value as WorkerApplicationSort);
                  setCurrentPage(1);
                }}
                className={`h-10 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-[13px] text-[#0F172A] outline-none transition-colors focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] ${FOCUS_RING}`}
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
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

        {isError ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <AlertCircle size={30} className="text-rose-500" />
            <p className="text-[14px] text-red-600">
              {error instanceof Error
                ? error.message
                : "Không thể tải danh sách hồ sơ"}
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
              ) : applications.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-400">
                  <Inbox size={30} strokeWidth={1.5} />
                  <p className="text-[14px]">Không tìm thấy hồ sơ nào</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {applications.map((application) => (
                    <li
                      key={application.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Xem chi tiết hồ sơ ${application.worker.fullName}`}
                      onClick={() => openDetail(application.id)}
                      onKeyDown={(event) =>
                        handleCardKeyDown(event, application.id)
                      }
                      className={`cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50/60 active:bg-slate-50 ${FOCUS_RING}`}
                    >
                      <div className="flex items-start gap-3">
                        <WorkerAvatar
                          key={
                            application.worker.avatarUrl ??
                            application.worker.userId
                          }
                          name={application.worker.fullName}
                          avatarUrl={application.worker.avatarUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-[#0F172A]">
                            {application.worker.fullName || "Chưa cập nhật tên"}
                          </p>
                          <div className="mt-1 min-w-0">
                            <CopyApplicationId id={application.id} />
                          </div>
                        </div>
                        <StatusBadge status={application.status} />
                      </div>
                      <dl className="mt-4 rounded-xl bg-slate-50 px-3">
                        <div className="flex items-start justify-between gap-3 py-2.5">
                          <dt className="shrink-0 text-[13px] text-[#64748B]">
                            Dịch vụ
                          </dt>
                          <dd className="min-w-0 text-right text-[13px] font-medium text-[#0F172A]">
                            <ServiceText application={application} />
                          </dd>
                        </div>
                        <div className="flex items-start justify-between gap-3 border-t border-slate-100 py-2.5">
                          <dt className="shrink-0 text-[13px] text-[#64748B]">
                            Khu vực
                          </dt>
                          <dd className="min-w-0 whitespace-normal break-words text-right text-[13px] font-medium text-[#0F172A]">
                            {application.serviceArea?.address ?? "—"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 py-2.5">
                          <dt className="text-[13px] text-[#64748B]">
                            Ngày đăng ký
                          </dt>
                          <dd className="text-[13px] font-medium text-[#0F172A]">
                            {formatDate(application.createdAt)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex justify-end">
                        <DetailButton
                          mobile
                          onClick={() => openDetail(application.id)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="hidden min-w-0 overflow-x-auto overscroll-x-contain md:block">
              <table className="w-full min-w-[850px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[21%]" />
                  <col className="w-[17%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[12px] font-semibold text-[#0F172A] lg:text-[13px]">
                    <th className="px-5 py-3.5">Thợ đăng ký</th>
                    <th className="px-4 py-3.5">Dịch vụ</th>
                    <th className="px-4 py-3.5">Khu vực</th>
                    <th className="px-4 py-3.5">Ngày đăng ký</th>
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
                          <Skeleton className="h-4 w-28" />
                        </td>
                        <td className="px-4 py-4">
                          <Skeleton className="h-4 w-24" />
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
                  ) : applications.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-400">
                          <Inbox size={30} strokeWidth={1.5} />
                          <p className="text-[14px]">
                            Không tìm thấy hồ sơ nào
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    applications.map((application) => (
                      <tr
                        key={application.id}
                        tabIndex={0}
                        aria-label={`Xem chi tiết hồ sơ ${application.worker.fullName}`}
                        onClick={() => openDetail(application.id)}
                        onKeyDown={(event) =>
                          handleRowKeyDown(event, application.id)
                        }
                        className="group cursor-pointer transition-colors hover:bg-slate-50/60 focus-visible:bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FF5E14]"
                      >
                        <td className="px-5 py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <WorkerAvatar
                              key={
                                application.worker.avatarUrl ??
                                application.worker.userId
                              }
                              name={application.worker.fullName}
                              avatarUrl={application.worker.avatarUrl}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-[#0F172A] lg:text-[14px]">
                                {application.worker.fullName ||
                                  "Chưa cập nhật tên"}
                              </p>
                              <div className="mt-1 min-w-0">
                                <CopyApplicationId id={application.id} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          <ServiceText application={application} />
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          <span
                            className="block whitespace-normal break-words"
                            title={application.serviceArea?.address ?? ""}
                          >
                            {application.serviceArea?.address ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 whitespace-nowrap text-slate-600">
                            <CalendarDays
                              size={15}
                              className="shrink-0 text-slate-400"
                            />
                            {formatDate(application.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={application.status} />
                        </td>
                        <td className="px-3 py-4 text-center">
                          <DetailButton
                            onClick={() => openDetail(application.id)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-3 py-4 sm:px-6">
              <div className="flex flex-col items-center justify-between gap-3 text-[13px] text-[#64748B] xl:flex-row">
                <div className="flex items-center gap-2">
                  <span>· Tổng {total} hồ sơ</span>
                  {isFetching && !isLoading && <span>· Đang cập nhật...</span>}
                </div>
                <nav
                  aria-label="Phân trang hồ sơ thợ"
                  className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-2"
                >
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1 || isLoading || isFetching}
                    onClick={() => changePage(safeCurrentPage - 1)}
                    className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="size-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>
                  {visiblePages.map((number) =>
                    typeof number === "number" ? (
                      <button
                        key={number}
                        type="button"
                        disabled={isLoading || isFetching}
                        onClick={() => changePage(number)}
                        aria-current={
                          safeCurrentPage === number ? "page" : undefined
                        }
                        className={`h-10 min-w-10 rounded-xl px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${safeCurrentPage === number ? "bg-[#FF5E14] text-white shadow-sm" : "bg-white text-slate-900 hover:bg-slate-100"}`}
                      >
                        {number}
                      </button>
                    ) : (
                      <span
                        key={number}
                        aria-hidden="true"
                        className="flex h-9 min-w-5 items-center justify-center text-sm font-semibold text-slate-900 sm:h-10 sm:min-w-8"
                      >
                        ...
                      </span>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={
                      safeCurrentPage >= totalPages || isLoading || isFetching
                    }
                    onClick={() => changePage(safeCurrentPage + 1)}
                    className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="size-4" />
                  </button>
                </nav>
              </div>
            </div>
          </>
        )}
      </div>
      <WorkerApplicationDetail
        id={selectedApplicationId}
        onClose={() => {
          setSelectedApplicationId(null);
        }}
      />
    </div>
  );
}
