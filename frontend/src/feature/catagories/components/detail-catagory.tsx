"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoryDetailQuery } from "../hooks/use-categories";

export interface DetailCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId?: string;
}

const formatDate = (date?: string | null) => {
  if (!date) return "—";

  const parsed = new Date(date);

  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("vi-VN");
};

const DetailSkeleton = () => (
  <div className="mt-5 space-y-5">
    <div className="flex items-start gap-4">
      <div>
        <Skeleton className="mb-1.5 h-3 w-14" />
        <Skeleton className="h-[88px] w-[88px] rounded-2xl" />
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>

        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>

    <div>
      <Skeleton className="mb-3 h-4 w-44" />

      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const DetailCatalogModal = ({
  isOpen,
  onClose,
  categoryId,
}: DetailCatalogModalProps) => {
  const [imageError, setImageError] = useState(false);

  const {
    data: category,
    isPending,
    isError,
    error,
    refetch,
  } = useCategoryDetailQuery(isOpen ? categoryId : undefined);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Lớp nền mờ */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Khung modal */}
      <div className="relative z-10 my-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-150 bg-white p-6 shadow-2xl sm:p-7 animate-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">
            Chi tiết danh mục
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết danh mục"
            className="cursor-pointer rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* NỘI DUNG */}
        {isPending ? (
          <DetailSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-center text-sm text-red-600">
              {error instanceof Error
                ? error.message
                : "Không thể tải chi tiết danh mục"}
            </p>

            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-xl bg-[#FF5E14] px-4 py-2 text-sm font-semibold text-white"
            >
              Thử lại
            </button>
          </div>
        ) : category ? (
          <div className="mt-5 space-y-5">
            {/* PHẦN 1: HÌNH ẢNH VÀ THÔNG TIN TỔNG QUAN */}
            <div className="flex items-start gap-4">
              {/* Hình ảnh danh mục */}
              <div className="shrink-0">
                {/* <span className="mb-1.5 block text-xs font-medium text-slate-400">
                  Hình ảnh
                </span> */}

                <div className="flex h-[88px] w-[88px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                  {category.imageUrl && !imageError ? (
                    <img
                      key={category.id}
                      src={category.imageUrl}
                      alt={category.name}
                      onError={() => setImageError(true)}
                      className="h-full w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-xl font-bold text-[#FF5E14]">
                      {category.name.charAt(0).toUpperCase() || "⚡"}
                    </div>
                  )}
                </div>
              </div>

              {/* Tên, trạng thái và mô tả */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="break-words text-xl font-black text-slate-900">
                    {category.name}
                  </h3>

                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      category.isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        category.isActive ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />

                    <span>{category.isActive ? "Active" : "Disabled"}</span>
                  </span>
                </div>

                <div className="mt-2.5">
                  {/* <span className="mb-1 block text-xs font-medium text-slate-400">
                    Mô tả
                  </span> */}

                  <div className="break-words whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-700 sm:text-sm">
                    {category.description || "Chưa có mô tả"}
                  </div>
                </div>
              </div>
            </div>

            {/* PHẦN 2: DỊCH VỤ TRONG DANH MỤC */}

            {/* PHẦN 2: DỊCH VỤ TRONG DANH MỤC */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  Dịch vụ trong danh mục{" "}
                  <span className="text-[#FF5E14]">
                    ({category._count.services})
                  </span>
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {category.services.map((service) => (
                  <div
                    key={service.id}
                    className="group flex min-w-0 flex-col items-center gap-2"
                    title={service.description}
                  >
                    {/* Ảnh dịch vụ */}
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-orange-300 group-hover:shadow-md">
                      {service.iconUrl ? (
                        <img
                          src={service.iconUrl}
                          alt={service.name}
                          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-[#FF5E14]">
                          {service.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Tên dịch vụ */}
                    <p className="line-clamp-2 min-h-8 w-full break-words text-center text-xs font-semibold leading-4 text-slate-700">
                      {service.name}
                    </p>
                  </div>
                ))}

                {category.services.length === 0 && (
                  <p className="col-span-full py-5 text-center text-sm text-slate-500">
                    Chưa có dịch vụ nào.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* FOOTER */}
        <div className="mt-6 flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {isPending ? (
              <>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </>
            ) : category ? (
              <>
                {/* <span>
                  Tạo:{" "}
                  <strong className="text-slate-800">
                    {formatDate(category.createdAt)}
                  </strong>
                </span>

                <span>
                  Cập nhật:{" "}
                  <strong className="text-slate-800">
                    {formatDate(category.updatedAt)}
                  </strong>
                </span> */}
              </>
            ) : null}
          </div>

          {/* <button
            type="button"
            onClick={onClose}
            className="self-end cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:self-auto sm:text-sm"
          >
            Đóng
          </button> */}
        </div>
      </div>
    </div>
  );
};

export default DetailCatalogModal;
