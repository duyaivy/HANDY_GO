"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  useServiceListQuery,
  useUpdateServiceStatusMutation,
  useDeleteServiceMutation,
} from "../hooks/use-services";
import { useServiceQueryConfig } from "../hooks/use-service-query-config";
import { useCategoryListQuery } from "@/feature/catagories/hooks/use-categories";
import {
  Plus,
  Search,
  Layers,
  ChevronDown,
  Power,
  Trash2,
  MoreVertical,
  Eye,
  Pencil,
  Wrench,
} from "lucide-react";
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

import { ServiceCategory, ServiceItem } from "../types";

import AddServiceModal from "./add-service";
import EditServiceModal from "./edit-service";
import DetailServiceModal from "./detail-service";

type ModalMode = "add" | "edit" | "detail" | null;

export default function ServiceTable() {
  const router = useRouter();
  const updateServiceStatus = useUpdateServiceStatusMutation();
  const deleteService = useDeleteServiceMutation();
  const pathname = usePathname();
  const queryConfig = useServiceQueryConfig();
  const page = Math.max(1, Number(queryConfig.page) || 1);
  const limit = Math.max(1, Number(queryConfig.limit) || 5);

  const {
    data: serviceData,
    isPending,
    isError,
  } = useServiceListQuery(queryConfig);
  const { data: categoryData, isPending: isCategoryPending } =
    useCategoryListQuery({ page: "1", limit: "100" });

  const categories: ServiceCategory[] = (categoryData?.data ?? []).map(
    (category) => ({ id: category.id, name: category.name }),
  );

  const services: ServiceItem[] = serviceData?.data ?? [];

  const total = serviceData?.meta.total ?? 0;
  const totalPages = Math.max(1, serviceData?.meta.totalPages ?? 1);
  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1,
  ).filter(
    (number) =>
      number === 1 || number === totalPages || Math.abs(number - page) <= 1,
  );
  const [search, setSearch] = useState(queryConfig.search ?? "");
  const categoryFilter = queryConfig.categoryId ?? "all";
  const statusFilter =
    queryConfig.isActive === "true"
      ? "active"
      : queryConfig.isActive === "false"
        ? "disabled"
        : "all";

  const updateQuery = (params: Record<string, string | undefined>) => {
    const urlParams = new URLSearchParams(window.location.search);
    Object.entries(params).forEach(([key, value]) => {
      if (value) urlParams.set(key, value);
      else urlParams.delete(key);
    });
    const query = urlParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
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
  const [serviceToDelete, setServiceToDelete] = useState<ServiceItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // FE-02: Render menu qua Portal để không bị overflow-x-auto cắt mất.
  const toggleServiceMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    serviceId: string,
  ) => {
    if (openMenuId === serviceId) {
      setOpenMenuId(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192; // w-48
    const estimatedMenuHeight = 224;
    const viewportPadding = 8;
    const openAbove =
      window.innerHeight - rect.bottom <
        estimatedMenuHeight + viewportPadding &&
      rect.top >= estimatedMenuHeight + viewportPadding;

    setMenuPosition({
      top: openAbove
        ? Math.max(viewportPadding, rect.top - estimatedMenuHeight - 4)
        : Math.min(
            rect.bottom + 4,
            window.innerHeight - estimatedMenuHeight - viewportPadding,
          ),
      left: Math.max(
        viewportPadding,
        Math.min(
          rect.right - menuWidth,
          window.innerWidth - menuWidth - viewportPadding,
        ),
      ),
    });
    setOpenMenuId(serviceId);
  };

  useEffect(() => {
    if (!openMenuId) return;

    const closeMenu = () => setOpenMenuId(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);
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

  const handleToggleStatus = async (service: ServiceItem) => {
    try {
      await updateServiceStatus.mutateAsync({
        id: service.id,
        isActive: !service.isActive,
      });
    } catch (error) {
      console.error("Lỗi cập nhật trạng thái dịch vụ:", error);
    }
  };

  const handleDeleteService = (service: ServiceItem) => {
    setDeleteError("");
    setServiceToDelete(service);
  };

  const confirmDeleteService = async () => {
    if (!serviceToDelete || deleteService.isPending) return;
    try {
      await deleteService.mutateAsync(serviceToDelete.id);
      setServiceToDelete(null);
      setDeleteError("");
    } catch (error) {
      console.error("Lỗi xóa vĩnh viễn dịch vụ:", error);
      setDeleteError("Không thể xóa dịch vụ. Vui lòng thử lại.");
    }
  };

  return (
    <div className="min-w-0 w-full space-y-5 sm:space-y-6 font-['Inter',sans-serif] text-[#0F172A] leading-[1.6] antialiased">
      {/* HEADER */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight leading-[1.3] text-[#0F172A] sm:text-2xl">
            Quản lý dịch vụ
          </h1>

          <p className="mt-1 text-[14px] font-normal text-[#64748B]">
            Quản lý dịch vụ theo từng danh mục trên HandyGo.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex w-auto shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#FF5E14] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#E9510D] sm:px-4 sm:text-sm"
        >
          <Plus size={16} />
          Thêm dịch vụ
        </button>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4">
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

          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-[minmax(200px,1fr)_220px_180px]">
            {/* SEARCH */}
            <div className="relative min-w-0">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                placeholder="Tìm dịch vụ..."
                className="w-full min-w-0 rounded-lg border border-slate-200 py-2 pl-9 pr-2 text-xs outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:text-sm"
              />
            </div>

            {/* CATEGORY FILTER */}
            <div className="relative min-w-0">
              <select
                value={categoryFilter}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  updateQuery({
                    categoryId:
                      event.target.value === "all"
                        ? undefined
                        : event.target.value,
                    page: "1",
                  })
                }
                className="w-full min-w-0 appearance-none truncate rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-7 text-xs text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:pl-3 sm:pr-9 sm:text-sm"
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
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* STATUS FILTER */}
            <div className="relative col-span-2 min-w-0 sm:col-span-2 xl:col-span-1">
              <select
                value={statusFilter}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  updateQuery({
                    isActive:
                      event.target.value === "all"
                        ? undefined
                        : event.target.value === "active"
                          ? "true"
                          : "false",
                    page: "1",
                  })
                }
                className="w-full min-w-0 appearance-none truncate rounded-lg border border-slate-200 bg-white py-2 pl-2 pr-7 text-xs text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:pl-3 sm:pr-9 sm:text-sm"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* SERVICE TABLE — layout theo CategoryTable; giữ nguyên dữ liệu và handlers */}
        <div className="p-4 sm:p-5">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[850px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[13px] font-semibold text-[#0F172A]">
                  <th className="px-4 py-3.5 font-semibold">Dịch vụ</th>
                  <th className="px-4 py-3.5 font-semibold">Danh mục</th>
                  <th className="px-4 py-3.5 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3.5 text-right font-semibold">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[14px]">
                {isPending || isCategoryPending ? (
                  Array.from({ length: limit }, (_, index) => (
                    <tr key={index}>
                      <td className="px-4 py-4">
                        <Skeleton className="h-5 w-44" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-4 w-28" />
                      </td>
                      <td className="px-4 py-4">
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end">
                          <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : isError ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-sm text-red-500"
                    >
                      Không thể tải danh sách dịch vụ.
                    </td>
                  </tr>
                ) : filteredServices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center">
                      <p className="text-sm font-semibold text-gray-700">
                        Không tìm thấy dịch vụ
                      </p>
                      <p className="mt-1 text-[12px] text-[#64748B]">
                        Thử thay đổi từ khóa hoặc bộ lọc để tìm dịch vụ.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          updateQuery({
                            search: undefined,
                            categoryId: undefined,
                            isActive: undefined,
                            page: "1",
                          });
                        }}
                        className="mt-4 text-sm font-semibold text-[#FF5E14] hover:underline"
                      >
                        Xóa bộ lọc
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service) => (
                    <tr
                      key={service.id}
                      onClick={() => openDetailModal(service)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDetailModal(service);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Xem chi tiết dịch vụ ${service.name}`}
                      className="cursor-pointer transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                    >
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetailModal(service);
                          }}
                          className="flex items-center gap-3 text-left"
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-orange-50">
                            {service.iconUrl ? (
                              <img
                                src={service.iconUrl}
                                alt={service.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Wrench size={22} className="text-[#FF5E14]" />
                            )}
                          </div>
                          <span className="font-medium text-[#0F172A] hover:text-[#FF5E14]">
                            {service.name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {categories.find(
                          (category) => category.id === service.categoryId,
                        )?.name ?? "—"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${
                            service.isActive
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {service.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td
                        className="px-4 py-4 text-right"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <div className="relative inline-block">
                          <button
                            type="button"
                            aria-label={`Thao tác với ${service.name}`}
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === service.id}
                            onClick={(event) =>
                              toggleServiceMenu(event, service.id)
                            }
                            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
                          >
                            <MoreVertical size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile cards: không cần kéo ngang để xem bảng. */}
          <div className="space-y-3 md:hidden">
            {isPending || isCategoryPending ? (
              Array.from({ length: Math.min(limit, 5) }, (_, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-xl border border-slate-200 p-4"
                >
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              ))
            ) : isError ? (
              <p className="py-8 text-center text-sm text-red-500">
                Không thể tải danh sách dịch vụ.
              </p>
            ) : filteredServices.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Không tìm thấy dịch vụ
                </p>
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-[#FF5E14]"
                  onClick={() => {
                    setSearch("");
                    updateQuery({
                      search: undefined,
                      categoryId: undefined,
                      isActive: undefined,
                      page: "1",
                    });
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            ) : (
              filteredServices.map((service) => (
                <div
                  key={service.id}
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  {/* Danh mục và trạng thái nằm phía trên trên mobile. */}
                  <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-xs font-medium text-slate-500">
                      {categories.find(
                        (category) => category.id === service.categoryId,
                      )?.name ?? "—"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${service.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {service.isActive ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => openDetailModal(service)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-orange-50">
                        {service.iconUrl ? (
                          <img
                            src={service.iconUrl}
                            alt={service.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Wrench size={22} className="text-[#FF5E14]" />
                        )}
                      </div>
                      <span className="min-w-0 break-words text-sm font-medium text-[#0F172A]">
                        {service.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Thao tác với ${service.name}`}
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === service.id}
                      onClick={(event) => toggleServiceMenu(event, service.id)}
                      className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                      <MoreVertical size={19} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {!isPending && !isError && (
          <div className="flex flex-col items-center gap-3 border-t border-slate-100 p-3 sm:flex-row sm:justify-between sm:p-5">
            <p className="text-sm text-slate-500">
              Hiển thị {total === 0 ? 0 : (page - 1) * limit + 1}
              {" - "}
              {Math.min(page * limit, total)} trong tổng số {total} dịch vụ
            </p>
            {totalPages > 1 && (
              <Pagination className="mx-0 w-full justify-center sm:w-auto sm:justify-end">
                <PaginationContent className="flex-wrap">
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={page <= 1}
                      tabIndex={page <= 1 ? -1 : undefined}
                      className={
                        page <= 1
                          ? "pointer-events-none opacity-40"
                          : "cursor-pointer"
                      }
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
                          className={
                            page === number
                              ? "cursor-pointer border-[#FF5E14] bg-[#FF5E14] text-white hover:bg-[#E9510D] hover:text-white"
                              : "cursor-pointer"
                          }
                          onClick={(
                            event: React.MouseEvent<HTMLAnchorElement>,
                          ) => {
                            event.preventDefault();
                            if (number !== page)
                              updateQuery({ page: String(number) });
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
                      className={
                        page >= totalPages
                          ? "pointer-events-none opacity-40"
                          : "cursor-pointer"
                      }
                      onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
                        event.preventDefault();
                        if (page < totalPages)
                          updateQuery({ page: String(page + 1) });
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </section>

      {/* FE-02: Menu nằm ngoài vùng cuộn ngang của bảng. */}
      {openMenuId &&
        typeof document !== "undefined" &&
        (() => {
          const menuService = services.find(
            (service) => service.id === openMenuId,
          );
          if (!menuService) return null;

          return createPortal(
            <>
              <button
                type="button"
                aria-label="Đóng menu"
                className="fixed inset-0 z-[80] cursor-default"
                onClick={() => setOpenMenuId(null)}
              />
              <div
                role="menu"
                aria-label={`Thao tác với ${menuService.name}`}
                className="fixed z-[81] w-48 rounded-lg border border-gray-100 bg-white py-1 text-left shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openDetailModal(menuService);
                    setOpenMenuId(null);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-[14px] text-[#0F172A] hover:bg-gray-50"
                >
                  <Eye size={16} /> Xem chi tiết
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    openEditModal(menuService);
                    setOpenMenuId(null);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-[14px] text-[#0F172A] hover:bg-gray-50"
                >
                  <Pencil size={16} /> Chỉnh sửa
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={updateServiceStatus.isPending}
                  onClick={() => {
                    setOpenMenuId(null);
                    void handleToggleStatus(menuService);
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50 ${
                    menuService.isActive ? "text-orange-600" : "text-green-600"
                  }`}
                >
                  <Power size={16} />{" "}
                  {menuService.isActive ? "Vô hiệu hóa" : "Kích hoạt"}
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenuId(null);
                    handleDeleteService(menuService);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} /> Xóa vĩnh viễn
                </button>
              </div>
            </>,
            document.body,
          );
        })()}

      {/* DELETE CONFIRMATION MODAL */}
      {serviceToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-service-title"
            aria-describedby="delete-service-description"
            className="relative z-10 w-full max-w-[370px] rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 size={22} />
            </div>
            <h2
              id="delete-service-title"
              className="text-lg font-bold text-slate-900"
            >
              Xóa vĩnh viễn dịch vụ?
            </h2>
            <p
              id="delete-service-description"
              className="mt-3 text-sm leading-6 text-slate-600"
            >
              Bạn có chắc muốn xóa dịch vụ{" "}
              <span className="font-bold">{serviceToDelete.name}</span>? Hành
              động này không thể hoàn tác.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Chỉ có thể xóa nếu dịch vụ đáp ứng điều kiện của hệ thống.
            </p>
            {deleteError && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600"
              >
                {deleteError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleteService.isPending}
                onClick={() => {
                  setServiceToDelete(null);
                  setDeleteError("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deleteService.isPending}
                onClick={confirmDeleteService}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteService.isPending ? "Đang xóa..." : "Xóa vĩnh viễn"}
              </button>
            </div>
          </div>
        </div>
      )}

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
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:rounded-2xl sm:p-5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-12 sm:w-12 sm:rounded-xl ${colorClasses[color]}`}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-[11px] leading-4 text-slate-500 sm:text-sm">
          {title}
        </p>
        <p className="mt-1 text-lg font-bold text-slate-900 sm:text-2xl">
          {value}
        </p>
      </div>
    </div>
  );
}
