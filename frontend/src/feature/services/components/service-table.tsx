"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useServiceListQuery } from "../hooks/use-services";
import { useServiceQueryConfig } from "../hooks/use-service-query-config";
import { useCategoryListQuery } from "@/feature/catagories/hooks/use-categories";
import { Plus, Search, Layers, ChevronDown, Power } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

import { ServiceCategory, ServiceFormData, ServiceItem } from "../types";

import ServiceCard from "./service-card";
import AddServiceModal from "./add-service";
import EditServiceModal from "./edit-service";
import DetailServiceModal from "./detail-service";

type ModalMode = "add" | "edit" | "detail" | null;

export default function ServiceTable() {
  const router = useRouter();
  const pathname = usePathname();
  const queryConfig = useServiceQueryConfig();
  const page = Math.max(1, Number(queryConfig.page) || 1);
  const limit = Math.max(1, Number(queryConfig.limit) || 5);

  const { data: serviceData, isPending, isError } = useServiceListQuery(queryConfig);
  const { data: categoryData, isPending: isCategoryPending } = useCategoryListQuery({ page: "1", limit: "100" });

  const categories: ServiceCategory[] = (categoryData?.data ?? []).map(
    (category) => ({ id: category.id, name: category.name }),
  );

  // Danh sách lấy từ API. Sửa và đổi trạng thái vẫn đang dùng bản nháp frontend.
  const [draftUpdates, setDraftUpdates] = useState<Record<string, Partial<ServiceItem>>>({});
  const services = useMemo<ServiceItem[]>(() => {
    const apiServices = (serviceData?.data ?? []).map((service) => ({
      ...service,
      ...draftUpdates[service.id],
    }));
    return apiServices;
  }, [serviceData, draftUpdates]);

  const total = serviceData?.meta.total ?? 0;
  const totalPages = Math.max(1, serviceData?.meta.totalPages ?? 1);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1);
  const [search, setSearch] = useState(queryConfig.search ?? "");
  const categoryFilter = queryConfig.categoryId ?? "all";
  const statusFilter = queryConfig.isActive === "true" ? "active" : queryConfig.isActive === "false" ? "disabled" : "all";

  const updateQuery = (params: Record<string, string | undefined>) => {
    const urlParams = new URLSearchParams(window.location.search);
    Object.entries(params).forEach(([key, value]) => {
      if (value) urlParams.set(key, value);
      else urlParams.delete(key);
    });
    const query = urlParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (queryConfig.search ?? "")) {
        updateQuery({ search: search.trim() || undefined, page: "1" });
      }
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, queryConfig.search]);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(
    null,
  );

  const activeCount = services.filter((service) => service.isActive).length;
  const disabledCount = services.length - activeCount;

  // Backend đã lọc theo search, categoryId, isActive và page.
  const filteredServices = services;

  const openAddModal = () => {
    setSelectedService(null);
    setModalMode("add");
  };

  const openEditModal = (service: ServiceItem) => {
    setSelectedService(service);
    setModalMode("edit");
  };

  const openDetailModal = (service: ServiceItem) => {
    setSelectedService(service);
    setModalMode("detail");
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedService(null);
  };

  const handleEditService = (data: ServiceFormData) => {
    if (!selectedService) return;

    const changes = { ...data, updatedAt: new Date().toISOString() };
    setDraftUpdates((current) => ({
      ...current,
      [selectedService.id]: { ...current[selectedService.id], ...changes },
    }));

    closeModal();
  };

  const handleToggleStatus = (service: ServiceItem) => {
    const changes = {
      isActive: !service.isActive,
      updatedAt: new Date().toISOString(),
    };
    setDraftUpdates((current) => ({
      ...current,
      [service.id]: { ...current[service.id], ...changes },
    }));
  };

  return (
    <div className="min-w-0 w-full space-y-5 sm:space-y-6">
      {/* HEADER */}
      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Quản lý</span>
            <span>/</span>
            <span className="text-slate-600">Dịch vụ</span>
          </div>

          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Quản lý dịch vụ
          </h1>

          <p className="mt-1 text-sm leading-5 text-slate-500">
            Quản lý dịch vụ theo từng danh mục trên HandyGo.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5E14] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#E9510D] sm:w-auto sm:px-5"
        >
          <Plus size={18} />
          Thêm dịch vụ
        </button>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        <SummaryCard
          title="Tổng dịch vụ"
          value={total}
          icon={<Layers size={20} />}
          color="orange"
        />

        <SummaryCard
          title="Hoạt động (trang này)"
          value={activeCount}
          icon={<Power size={20} />}
          color="green"
        />

        <SummaryCard
          title="Vô hiệu hóa (trang này)"
          value={disabledCount}
          icon={<Power size={20} />}
          color="gray"
        />
      </div>

      {/* LIST */}
      <section className="min-w-0 overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* SEARCH & FILTERS */}
        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Danh sách dịch vụ
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tổng cộng {total} dịch vụ
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_220px_180px]">
            {/* SEARCH */}
            <div className="relative min-w-0">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                placeholder="Tìm tên dịch vụ..."
                className="w-full min-w-0 rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            {/* CATEGORY FILTER */}
            <div className="relative min-w-0">
              <select
                value={categoryFilter}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => updateQuery({ categoryId: event.target.value === "all" ? undefined : event.target.value, page: "1" })}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              >
                <option value="all">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* STATUS FILTER */}
            <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
              <select
                value={statusFilter}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => updateQuery({ isActive: event.target.value === "all" ? undefined : event.target.value === "active" ? "true" : "false", page: "1" })}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* SERVICE GROUPS */}
        <div className="space-y-7 p-4 sm:p-5">
          {(isPending || isCategoryPending) && <ServiceListSkeleton />}
          {isError && <p className="text-sm text-red-500">Không thể tải danh sách dịch vụ.</p>}
          {!isPending && !isCategoryPending && !isError && categories
            .filter(
              (category) =>
                categoryFilter === "all" || category.id === categoryFilter,
            )
            .map((category) => {
              const categoryServices = filteredServices.filter(
                (service) => service.categoryId === category.id,
              );

              if (categoryServices.length === 0) return null;

              return (
                <section key={category.id} className="min-w-0">
                  <div className="mb-4 flex min-w-0 items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF5E14] sm:h-10 sm:w-10">
                        <Layers size={19} />
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-900">
                          {category.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {categoryServices.length} dịch vụ
                        </p>
                      </div>
                    </div>

                    <span className="hidden shrink-0 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 min-[420px]:inline-flex">
                      Danh mục
                    </span>
                  </div>

                  <div className="grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {categoryServices.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        onView={openDetailModal}
                        onEdit={openEditModal}
                        onToggleStatus={handleToggleStatus}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

          {/* EMPTY STATE */}
          {!isPending && !isCategoryPending && !isError && filteredServices.length === 0 && (
            <div className="flex flex-col items-center justify-center px-3 py-12 text-center sm:py-16">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Search size={24} />
              </div>

              <p className="text-sm font-bold text-slate-700">
                Không tìm thấy dịch vụ
              </p>

              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
                Thử thay đổi từ khóa hoặc bộ lọc để tìm dịch vụ.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  updateQuery({ search: undefined, categoryId: undefined, isActive: undefined, page: "1" });
                }}
                className="mt-4 text-sm font-semibold text-[#FF5E14] hover:underline"
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
        </div>
        {!isPending && !isError && (
          <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <p className="text-sm text-slate-500">
              Hiển thị {total === 0 ? 0 : (page - 1) * limit + 1}
              {" - "}
              {Math.min(page * limit, total)} trong tổng số {total} dịch vụ
            </p>
            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                <PaginationContent className="flex-wrap">
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={page <= 1}
                      tabIndex={page <= 1 ? -1 : undefined}
                      className={page <= 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                      onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                        event.preventDefault();
                        if (page > 1) updateQuery({ page: String(page - 1) });
                      }}
                    />
                  </PaginationItem>
                  {pageNumbers.map((number, index) => (
                    <React.Fragment key={number}>
                      {index > 0 && number - pageNumbers[index - 1] > 1 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationLink
                          href="#"
                          isActive={page === number}
                          className={page === number
                            ? "cursor-pointer border-[#FF5E14] bg-[#FF5E14] text-white hover:bg-[#E9510D] hover:text-white"
                            : "cursor-pointer"}
                          onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                            event.preventDefault();
                            if (number !== page) updateQuery({ page: String(number) });
                          }}
                        >
                          {number}
                        </PaginationLink>
                      </PaginationItem>
                    </React.Fragment>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={page >= totalPages}
                      tabIndex={page >= totalPages ? -1 : undefined}
                      className={page >= totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                      onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                        event.preventDefault();
                        if (page < totalPages) updateQuery({ page: String(page + 1) });
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </section>

      {/* ADD MODAL */}
      {modalMode === "add" && (
        <AddServiceModal
          key="add-service"
          isOpen
          onClose={closeModal}
          categories={categories}
        />
      )}

      {/* EDIT MODAL */}
      {modalMode === "edit" && selectedService && (
        <EditServiceModal
          key={selectedService.id}
          isOpen
          onClose={closeModal}
          service={selectedService}
          categories={categories}
          onSave={handleEditService}
        />
      )}

      {/* DETAIL MODAL */}
      {modalMode === "detail" && selectedService && (
        <DetailServiceModal
          key={selectedService.id}
          isOpen
          onClose={closeModal}
          service={selectedService}
          categories={categories}
          onEdit={openEditModal}
        />
      )}
    </div>
  );
}

function ServiceListSkeleton() {
  return (
    <div className="space-y-7" role="status" aria-label="Đang tải danh sách dịch vụ">
      {Array.from({ length: 2 }, (_, group) => (
        <section key={group} className="min-w-0">
          <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: group === 0 ? 5 : 3 }, (_, index) => (
              <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <div className="flex justify-between pt-2">
                  <Skeleton className="h-6 w-16 rounded-lg" />
                  <Skeleton className="h-6 w-7 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: "orange" | "green" | "gray";
}) {
  const colorClasses = {
    orange: "bg-orange-50 text-[#FF5E14]",
    green: "bg-emerald-50 text-emerald-600",
    gray: "bg-slate-100 text-slate-500",
  };

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-5">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${colorClasses[color]}`}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-xs leading-5 text-slate-500 sm:text-sm">{title}</p>
        <p className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
          {value}
        </p>
      </div>
    </div>
  );
}
