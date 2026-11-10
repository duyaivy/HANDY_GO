"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
} from "lucide-react";
import { KYC_STATUS_CONFIG, KycFilterStatus, KycRecord } from "../types/type";

import KycDetailModal from "./KycDetailModal";
import { Skeleton } from "@/components/ui/skeleton";
import { useKycListQuery, useReviewKyc } from "../hooks/use-kyc";

export const KycTable: React.FC = () => {
  const [filterStatus, setFilterStatus] =
    useState<KycFilterStatus>("reviewing");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRecordSnapshot, setSelectedRecordSnapshot] =
    useState<KycRecord | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Tìm kiếm trên toàn bộ dữ liệu ở Backend, tránh gọi API khi gõ từng ký tự.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 400);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const { data, isPending, isFetching, isError, error, refetch } =
    useKycListQuery({
      status: filterStatus === "all" ? undefined : filterStatus,
      search: debouncedSearch || undefined,
      sortBy,
      page: currentPage,
      limit: itemsPerPage,
    });
  const reviewMutation = useReviewKyc();

  // Backend trả aiSimilarityScore là string | number | null.
  // Chuyển về number | null và bổ sung reviewHistories để tương thích
  // với kiểu KycRecord mà modal hiện tại đang sử dụng.
  const records = useMemo<KycRecord[]>(
    () =>
      (data?.data ?? []).map((record) => ({
        ...record,
        aiSimilarityScore:
          record.aiSimilarityScore == null
            ? null
            : Number.isFinite(Number(record.aiSimilarityScore))
              ? Number(record.aiSimilarityScore)
              : null,
        reviewHistories: [],
      })),
    [data],
  );

  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ??
    (selectedRecordSnapshot?.id === selectedRecordId
      ? selectedRecordSnapshot
      : null);

  const openRecord = (record: KycRecord) => {
    setSelectedRecordId(record.id);
    setSelectedRecordSnapshot(record);
  };

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
  };

  // Tự động ẩn thông báo sau 3 giây; dọn timer khi thông báo thay đổi.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Backend đã tìm kiếm, sắp xếp trên toàn bộ danh sách trước khi phân trang.
  // Không lọc/sắp xếp lại ở FE để tránh sai thứ tự và sai tổng kết quả.
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRecords = records;

  // Hiển thị tối đa 5 trang liên tiếp, kèm trang đầu/cuối và dấu ...
  const visiblePages = useMemo<
    (number | "ellipsis-left" | "ellipsis-right")[]
  >(() => {
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

    for (let page = start; page <= end; page++) {
      pageNumbers.add(page);
    }

    const sortedPages = [...pageNumbers].sort((a, b) => a - b);
    const result: (number | "ellipsis-left" | "ellipsis-right")[] = [];

    for (let index = 0; index < sortedPages.length; index++) {
      const page = sortedPages[index];
      const previous = sortedPages[index - 1];

      if (previous !== undefined && page - previous === 2) {
        result.push(previous + 1);
      } else if (previous !== undefined && page - previous > 2) {
        result.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
      }

      result.push(page);
    }

    return result;
  }, [safeCurrentPage, totalPages]);

  const handleApprove = async (id: string, note: string) => {
    if (selectedRecord?.id !== id || selectedRecord.status !== "reviewing")
      throw new Error("Hồ sơ không còn đủ điều kiện phê duyệt");
    try {
      await reviewMutation.mutateAsync({
        id,
        body: { decision: "approved", note: note.trim() },
      });
      showToast(`Đã phê duyệt thành công hồ sơ ${id}`);
      setCurrentPage(1);
      setSelectedRecordId(null);
      setSelectedRecordSnapshot(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Phê duyệt hồ sơ thất bại",
        "error",
      );
      throw err;
    }
  };

  const handleReject = async (id: string, reason: string) => {
    const note = reason.trim();

    if (
      !note ||
      selectedRecord?.id !== id ||
      selectedRecord.status !== "reviewing"
    ) {
      throw new Error("Hồ sơ không hợp lệ hoặc thiếu lý do từ chối");
    }

    try {
      await reviewMutation.mutateAsync({
        id,
        body: { decision: "rejected", note },
      });

      showToast(`Đã từ chối hồ sơ ${id}`);
      setCurrentPage(1);
      setSelectedRecordId(null);
      setSelectedRecordSnapshot(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Từ chối hồ sơ thất bại",
        "error",
      );

      throw err;
    }
  };

  const renderDateTime = (dateStr: string | null) => {
    if (!dateStr) {
      return (
        <span className="text-slate-400 italic whitespace-nowrap">
          Chưa nộp
        </span>
      );
    }

    const date = new Date(dateStr);

    if (Number.isNaN(date.getTime())) {
      return <span className="text-slate-400">Không hợp lệ</span>;
    }

    const datePart = new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);

    return (
      <div className="flex flex-col whitespace-nowrap text-[13px] leading-tight text-[#0F172A]">
        <span className="font-medium">{datePart}</span>
        <span className="mt-1 text-[12px] text-[#64748B]">{timePart}</span>
      </div>
    );
  };

  return (
    <div className="w-full min-w-0 font-['Inter',sans-serif] text-[#0F172A] leading-[1.6] antialiased">
      {/* Toast thông báo */}
      {toast && (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          className="fixed bottom-6 right-6 z-80 flex w-[calc(100vw-3rem)] max-w-[420px] items-start gap-3 rounded-xl bg-slate-900 px-4 py-3 text-[13px] font-medium text-white shadow-xl animate-in slide-in-from-bottom-2 duration-200"
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Đóng thông báo"
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. HEADER TRANG: Tiêu đề 24px + Mô tả */}
      {/* ========================================================================= */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-[24px] font-semibold text-[#0F172A] tracking-tight leading-[1.3]">
          Xác minh thợ
        </h1>
        <p className="text-[14px] text-[#64748B] mt-1 font-normal">
          Quản lý hồ sơ xác minh danh tính của thợ
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 2. THANH BỘ LỌC VÀ TÌM KIẾM */}
      {/* ========================================================================= */}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="relative w-full min-w-0 md:w-[280px] md:max-w-[340px] md:flex-[1_1_240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm theo tên thợ hoặc mã hồ sơ..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-[14px] text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] shadow-2xs transition-all"
          />
        </div>

        <div className="grid w-full grid-cols-2 gap-3 md:ml-auto md:w-auto md:flex-none">
          <div className="relative min-w-0 md:w-[170px]">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as KycFilterStatus);
                setCurrentPage(1);
              }}
              className="w-full appearance-none pl-3.5 pr-8 py-2.5 rounded-xl bg-white border border-slate-200 text-[13px] font-medium text-[#0F172A] focus:outline-none focus:border-[#FF5E14] shadow-2xs cursor-pointer"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="reviewing">Chờ xét duyệt</option>
              <option value="submitted">Chờ xử lý</option>
              <option value="draft">Bản nháp</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative min-w-0 md:w-[130px]">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as "newest" | "oldest");
                setCurrentPage(1);
              }}
              className="w-full appearance-none pl-3.5 pr-8 py-2.5 rounded-xl bg-white border border-slate-200 text-[13px] font-medium text-[#0F172A] focus:outline-none focus:border-[#FF5E14] shadow-2xs cursor-pointer"
            >
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. BẢNG DANH SÁCH 5 CỘT FULL WIDTH 100% */}
      {/* ========================================================================= */}
      <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] table-fixed text-left border-collapse">
            <colgroup>
              <col className="w-[29%]" />
              <col className="w-[20%]" />
              <col className="w-[19%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[13px] font-semibold text-[#0F172A]">
                <th className="py-3.5 px-6">Thợ</th>
                <th className="py-3.5 px-4">Mã hồ sơ</th>
                <th className="py-3.5 px-4">Ngày nộp</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[14px]">
              {isPending ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={`kyc-skeleton-${index}`} aria-hidden="true">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                        <Skeleton className="h-4 w-32 rounded-md" />
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <Skeleton className="h-4 w-28 rounded-md" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24 rounded-md" />
                        <Skeleton className="h-3 w-16 rounded-md" />
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <Skeleton className="h-7 w-24 rounded-full" />
                    </td>
                    <td className="py-4 px-3">
                      <div className="flex justify-center">
                        <Skeleton className="h-8 w-24 rounded-lg" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-red-600">
                    <p>
                      {error instanceof Error
                        ? error.message
                        : "Không thể tải danh sách hồ sơ"}
                    </p>
                    <button
                      type="button"
                      onClick={() => void refetch()}
                      className="mt-2 text-[#FF5E14] underline"
                    >
                      Thử lại
                    </button>
                  </td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <p className="text-[14px]">
                      Không tìm thấy hồ sơ xác minh nào
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => {
                  const statusConf = KYC_STATUS_CONFIG[record.status];
                  return (
                    <tr
                      key={record.id}
                      onClick={() => openRecord(record)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openRecord(record);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Xem chi tiết hồ sơ của ${record.workerProfile.user.fullName}`}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/60 focus-visible:bg-slate-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-400"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {record.workerProfile.user.avatarUrl ? (
                            <img
                              src={record.workerProfile.user.avatarUrl}
                              alt={record.workerProfile.user.fullName}
                              className="w-10 h-10 rounded-full object-cover border border-slate-100 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-semibold text-sm flex items-center justify-center shrink-0">
                              {record.workerProfile.user.fullName.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-[#0F172A] leading-tight truncate">
                              {record.workerProfile.user.fullName}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void navigator.clipboard?.writeText(record.id);
                          }}
                          title={record.id}
                          className="inline-flex items-center gap-1.5 font-mono text-[13px] text-slate-700 whitespace-nowrap cursor-pointer hover:text-[#FF5E14]"
                        >
                          <span>{record.id.slice(0, 8)}…</span>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        {renderDateTime(record.submittedAt)}
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium whitespace-nowrap ${statusConf.badgeBg} ${statusConf.badgeText}`}
                        >
                          {statusConf.label}
                        </span>
                      </td>

                      <td className="py-4 px-3 whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRecord(record);
                            }}
                            aria-label={`Xem chi tiết hồ sơ ${record.id}`}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                          >
                            <span>Chi tiết</span>
                            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: hiển thị dạng card thay vì bảng ngang */}
        <div className="divide-y divide-slate-100 md:hidden">
          {isPending ? (
            Array.from({ length: 4 }, (_, index) => (
              <div key={`mobile-skeleton-${index}`} className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-36 rounded-md" />
                </div>
                <Skeleton className="h-4 w-48 rounded-md" />
                <Skeleton className="h-7 w-24 rounded-full" />
              </div>
            ))
          ) : isError ? (
            <div className="p-6 text-center text-sm text-red-600">
              <p>
                {error instanceof Error
                  ? error.message
                  : "Không thể tải danh sách hồ sơ"}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 font-medium text-[#FF5E14] underline"
              >
                Thử lại
              </button>
            </div>
          ) : paginatedRecords.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Không tìm thấy hồ sơ xác minh nào
            </div>
          ) : (
            paginatedRecords.map((record) => {
              const statusConf = KYC_STATUS_CONFIG[record.status];
              const fullName = record.workerProfile.user.fullName;
              return (
                <div key={record.id} className="space-y-4 p-4 sm:p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    {record.workerProfile.user.avatarUrl ? (
                      <img
                        src={record.workerProfile.user.avatarUrl}
                        alt={fullName}
                        className="h-11 w-11 shrink-0 rounded-full border border-slate-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                        {fullName.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0F172A]">
                        {fullName}
                      </p>
                      <p className="text-xs text-slate-400">
                        Hồ sơ xác minh thợ
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${statusConf.badgeBg} ${statusConf.badgeText}`}
                    >
                      {statusConf.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50/70 p-3 min-[420px]:grid-cols-2">
                    <div className="min-w-0">
                      <p className="mb-1 text-xs text-slate-500">Mã hồ sơ</p>
                      <button
                        type="button"
                        onClick={() =>
                          void navigator.clipboard?.writeText(record.id)
                        }
                        title={record.id}
                        className="inline-flex max-w-full items-center gap-1.5 text-left font-mono text-xs text-slate-700 hover:text-[#FF5E14]"
                      >
                        <span className="truncate">
                          {record.id.slice(0, 8)}…
                        </span>
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Ngày nộp</p>
                      {renderDateTime(record.submittedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openRecord(record)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]"
                  >
                    Xem chi tiết <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* PHÂN TRANG */}
        <div className="border-t border-slate-100 px-3 py-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-[13px] text-[#64748B] sm:flex-row">
            <div className="flex items-center gap-2">
              {/* <span>Hiển thị</span>
              <span className="font-medium text-[#0F172A]">{itemsPerPage}</span>
              <span>bản ghi/trang</span> */}
              <span>· Tổng {data?.pagination.total ?? 0} hồ sơ</span>
              {isFetching && !isPending && <span>· Đang cập nhật...</span>}
            </div>

            <nav
              aria-label="Phân trang hồ sơ xác minh"
              className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-2"
            >
              <button
                type="button"
                disabled={safeCurrentPage <= 1 || isPending || isFetching}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              {visiblePages.map((page) =>
                typeof page === "number" ? (
                  <button
                    key={page}
                    type="button"
                    disabled={isPending || isFetching}
                    onClick={() => setCurrentPage(page)}
                    aria-current={safeCurrentPage === page ? "page" : undefined}
                    className={`h-10 min-w-10 rounded-xl px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      safeCurrentPage === page
                        ? "bg-[#FF5E14] text-white shadow-sm"
                        : "bg-white text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {page}
                  </button>
                ) : (
                  <span
                    key={page}
                    aria-hidden="true"
                    className="flex h-9 min-w-5 items-center justify-center text-sm sm:h-10 sm:min-w-8 font-semibold text-slate-900"
                  >
                    ...
                  </span>
                ),
              )}

              <button
                type="button"
                disabled={
                  safeCurrentPage >= totalPages || isPending || isFetching
                }
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL CHI TIẾT HỒ SƠ KYC (CENTER MODAL) */}
      {/* ========================================================================= */}
      {selectedRecord && (
        <KycDetailModal
          key={selectedRecord.id}
          isOpen={true}
          record={selectedRecord}
          onClose={() => {
            setSelectedRecordId(null);
            setSelectedRecordSnapshot(null);
          }}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  );
};

export default KycTable;
