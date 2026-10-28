"use client";

import React from "react";
import { X, Wrench, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceCategory, ServiceItem } from "../types";
import { useServiceDetailQuery } from "../hooks/use-services";

interface DetailServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceItem | null;
  categories: ServiceCategory[];
  onEdit: (service: ServiceItem) => void;
}

function formatDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN");
}

export default function DetailServiceModal({
  isOpen,
  onClose,
  service,
  categories,
  onEdit,
}: DetailServiceModalProps) {
  const {
    data: serviceDetail,
    isPending,
    isError,
  } = useServiceDetailQuery(service?.id ?? "", isOpen && !!service);

  if (!isOpen || !service) return null;

  const currentService = serviceDetail ?? service;

  const categoryName =
    serviceDetail?.category?.name ??
    categories.find((category) => category.id === currentService.categoryId)
      ?.name ??
    "Chưa xác định";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <button
        type="button"
        aria-label="Đóng modal"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
      />

      <div className="relative z-10 my-auto w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Chi tiết dịch vụ
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Thông tin dịch vụ trên HandyGo
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        {isPending ? (
          <div className="space-y-5 p-6">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-orange-100 bg-[#FFF9F5] p-6">
              <Skeleton className="h-24 w-24 rounded-2xl" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>

            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-6">
            <p className="text-sm text-rose-600">
              Không thể tải chi tiết dịch vụ.
            </p>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <div className="flex flex-col items-center rounded-2xl border border-orange-100 bg-[#FFF9F5] p-6">
              {currentService.iconUrl ? (
                <img
                  src={currentService.iconUrl}
                  alt={currentService.name}
                  className="mb-3 h-24 w-24 rounded-2xl object-cover"
                />
              ) : (
                <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-2xl bg-orange-100 text-[#FF5E14]">
                  <Wrench size={34} />
                </div>
              )}

              <h3 className="text-lg font-bold text-slate-900">
                {currentService.name}
              </h3>

              <span
                className={`mt-2 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  currentService.isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {currentService.isActive ? "Active" : "Disabled"}
              </span>
            </div>

            <DetailRow label="Danh mục" value={categoryName} />

            <DetailRow
              label="Mô tả"
              value={currentService.description || "Chưa có mô tả"}
            />

            <DetailRow
              label="Ngày tạo"
              value={formatDate(currentService.createdAt)}
            />

            <DetailRow
              label="Cập nhật lần cuối"
              value={formatDate(currentService.updatedAt)}
            />

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={() => onEdit(currentService)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF5E14] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#E9510D]"
              >
                <Pencil size={15} />
                Chỉnh sửa
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-slate-100 pb-3 last:border-0">
      <span className="text-xs font-medium text-slate-400">{label}</span>

      <span className="break-words text-sm font-medium text-slate-700">
        {value}
      </span>
    </div>
  );
}
