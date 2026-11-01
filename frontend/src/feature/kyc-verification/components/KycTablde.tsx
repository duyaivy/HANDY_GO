"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
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

  const { data, isPending, isFetching, isError, error, refetch } =
    useKycListQuery({
      status: filterStatus === "all" ? undefined : filterStatus,
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

  // Swagger chưa hỗ trợ search/sort: chỉ xử lý trong trang hiện tại.
  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const getSortDate = (record: KycRecord) => {
      switch (filterStatus) {
        case "approved":
        case "rejected":
          return record.reviewedAt ?? record.submittedAt ?? record.createdAt;

        case "reviewing":
        case "submitted":
          return record.submittedAt ?? record.createdAt;

        case "draft":
          return record.createdAt;

        case "all":
        default:
          return record.updatedAt ?? record.submittedAt ?? record.createdAt;
      }
    };

    return [...records]
      .filter(
        (record) =>
          !query ||
          record.workerProfile.user.fullName.toLowerCase().includes(query) ||
          record.id.toLowerCase().includes(query),
      )
      .sort((a, b) => {
        const aTime = new Date(getSortDate(a)).getTime();
        const bTime = new Date(getSortDate(b)).getTime();

        return sortBy === "newest" ? bTime - aTime : aTime - bTime;
      });
  }, [records, searchQuery, sortBy, filterStatus]);

  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1);
  const safeCurrentPage = currentPage;
  const paginatedRecords = filteredRecords;

  const handleApprove = async (id: string, note: string) => {
    if (selectedRecord?.id !== id || selectedRecord.status !== "reviewing")
      return;
    try {
      await reviewMutation.mutateAsync({
        id,
        body: { decision: "approved", note: note.trim() },
      });
      showToast(`Đã phê duyệt thành công hồ sơ ${id}`);
      setSelectedRecordId(null);
      setSelectedRecordSnapshot(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Phê duyệt hồ sơ thất bại",
        "error",
      );
    }
  };

  const handleReject = async (id: string, reason: string) => {
    const note = reason.trim();
    if (
      !note ||
      selectedRecord?.id !== id ||
      selectedRecord.status !== "reviewing"
    )
      return;
    try {
      await reviewMutation.mutateAsync({
        id,
        body: { decision: "rejected", note },
      });
      showToast(`Đã từ chối hồ sơ ${id}`);
      setSelectedRecordId(null);
      setSelectedRecordSnapshot(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Từ chối hồ sơ thất bại",
        "error",
      );
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
    <div className="w-full font-['Inter',sans-serif] text-[#0F172A] leading-[1.6] antialiased">
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
        <h1 className="text-[24px] font-semibold text-[#0F172A] tracking-tight leading-[1.3]">
          Xác minh thợ
        </h1>
        <p className="text-[14px] text-[#64748B] mt-1 font-normal">
          Quản lý hồ sơ xác minh danh tính của thợ
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 2. THANH BỘ LỌC VÀ TÌM KIẾM */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
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

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="relative min-w-[160px]">
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

          <div className="relative min-w-[130px]">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
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
        <div className="overflow-x-auto">
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

        {/* PHÂN TRANG */}
        <div className="px-6 py-4 border-t border-slate-100">
          <div className="flex items-center justify-between gap-4 text-[13px] text-[#64748B]">
            <div className="flex items-center gap-2">
              {/* <span>Hiển thị</span>
              <span className="font-medium text-[#0F172A]">{itemsPerPage}</span>
              <span>bản ghi/trang</span> */}
              <span>· Tổng {data?.pagination.total ?? 0} hồ sơ</span>
              {isFetching && !isPending && <span>· Đang cập nhật...</span>}
            </div>

            <nav
              aria-label="Phân trang hồ sơ xác minh"
              className="flex flex-wrap items-center justify-center gap-2"
            >
              <button
                type="button"
                disabled={safeCurrentPage <= 1 || isPending}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Trước
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    Math.abs(page - currentPage) <= 2 ||
                    page === 1 ||
                    page === totalPages,
                )
                .map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    aria-current={safeCurrentPage === page ? "page" : undefined}
                    className={`h-9 min-w-9 rounded-lg px-2 text-sm font-bold transition-colors ${
                      safeCurrentPage === page
                        ? "bg-[#FF5E14] text-white"
                        : "bg-white text-slate-700 hover:bg-orange-50"
                    }`}
                  >
                    {page}
                  </button>
                ))}

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages || isPending}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL CHI TIẾT HỒ SƠ KYC (CENTER MODAL) */}
      {/* ========================================================================= */}
      <KycDetailModal
        isOpen={Boolean(selectedRecordId)}
        record={selectedRecord}
        onClose={() => {
          setSelectedRecordId(null);
          setSelectedRecordSnapshot(null);
        }}
        onApprove={handleApprove}
        onReject={handleReject}
      />
    </div>
  );
};

export default KycTable;
