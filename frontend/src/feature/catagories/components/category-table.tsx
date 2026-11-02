"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  Plus,
  MoreVertical,
  Eye,
  Pencil,
  Power,
  Trash2,
} from "lucide-react";

import AddCatalogModal from "./add-catagory";
import DetailCatalogModal from "./detail-catagory";
import { EditCatalogModal } from "./edit-catagory";

import type { CategoryItem } from "../types";
import {
  useCategoryListQuery,
  useUpdateCategoryStatus,
  useDeleteCategoryPermanently,
} from "../hooks/use-categories";
import { useCategoryQueryConfig } from "../hooks/use-category-query-config";
import { Skeleton } from "@/components/ui/skeleton";

type StatusFilter = "all" | "active" | "disabled";

const SkeletonRow = () => (
  <tr>
    <td className="px-4 py-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
    </td>

    <td className="px-4 py-4">
      <Skeleton className="h-4 w-8" />
    </td>

    <td className="px-4 py-4">
      <Skeleton className="h-4 w-24" />
    </td>

    <td className="px-4 py-4">
      <Skeleton className="h-6 w-28 rounded-full" />
    </td>

    <td className="px-4 py-4">
      <div className="flex justify-end">
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
    </td>
  </tr>
);

export const CategoryTable = () => {
  const router = useRouter();
  const pathname = usePathname();
  const queryConfig = useCategoryQueryConfig();

  const page = Math.max(1, Number(queryConfig.page) || 1);
  const limit = Math.max(1, Number(queryConfig.limit) || 5);

  const statusFilter: StatusFilter =
    queryConfig.isActive === "true"
      ? "active"
      : queryConfig.isActive === "false"
        ? "disabled"
        : "all";

  const { data, isPending, isError, error, refetch } =
    useCategoryListQuery(queryConfig);

  const categories: CategoryItem[] = (data?.data ?? []).map((category) => ({
    id: category.id,
    parentId: category.parentId,
    name: category.name,
    description: category.description,
    imageUrl: category.imageUrl,
    servicesCount: category._count.services,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }));

  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);

  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(
    null,
  );

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  // FE-02: Đặt menu ngoài vùng overflow-x-auto bằng Portal.
  const toggleCategoryMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    categoryId: string,
  ) => {
    if (openMenuId === categoryId) {
      setOpenMenuId(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 224;
    const padding = 8;
    const openAbove =
      window.innerHeight - rect.bottom < menuHeight + padding &&
      rect.top >= menuHeight + padding;

    setMenuPosition({
      top: openAbove
        ? Math.max(padding, rect.top - menuHeight - 4)
        : Math.max(
            padding,
            Math.min(
              rect.bottom + 4,
              window.innerHeight - menuHeight - padding,
            ),
          ),
      left: Math.max(
        padding,
        Math.min(
          rect.right - menuWidth,
          window.innerWidth - menuWidth - padding,
        ),
      ),
    });
    setOpenMenuId(categoryId);
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
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState("");

  const updateCategoryStatus = useUpdateCategoryStatus();
  const deleteCategory = useDeleteCategoryPermanently();

  const updateQuery = (params: Record<string, string | undefined>) => {
    const searchParams = new URLSearchParams(window.location.search);

    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        searchParams.set(key, value);
      } else {
        searchParams.delete(key);
      }
    });

    const query = searchParams.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const formatDate = (date: string) => {
    const parsed = new Date(date);

    return Number.isNaN(parsed.getTime())
      ? "—"
      : parsed.toLocaleDateString("vi-VN");
  };

  return (
    <div className="space-y-6 font-['Inter',sans-serif] text-[#0F172A] leading-[1.6] antialiased">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight leading-[1.3] text-[#0F172A]">
            Quản lý danh mục dịch vụ
          </h1>
          <p className="mt-1 text-[14px] font-normal text-[#64748B]">
            Quản lý các danh mục dịch vụ trên hệ thống HandyGo
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF5E14] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e9520d]"
        >
          <Plus size={18} />
          Thêm danh mục
        </button>
      </div>

      {/* Search and filter */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="text"
              value={queryConfig.search ?? ""}
              onChange={(e) =>
                updateQuery({
                  search: e.target.value,
                  page: "1",
                })
              }
              placeholder="Tìm kiếm danh mục..."
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#FF5E14]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) =>
              updateQuery({
                isActive:
                  e.target.value === "all"
                    ? undefined
                    : String(e.target.value === "active"),
                page: "1",
              })
            }
            className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#FF5E14]"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="disabled">Đã vô hiệu hóa</option>
          </select>
        </div>

        <p className="mt-4 text-sm font-semibold text-gray-800">
          Danh sách danh mục ({total})
        </p>

        {/* Table */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[13px] font-semibold text-[#0F172A]">
                <th className="px-4 py-3.5 font-semibold">Danh mục</th>
                <th className="px-4 py-3.5 font-semibold">Số dịch vụ</th>
                <th className="px-4 py-3.5 font-semibold">Cập nhật lần cuối</th>
                <th className="px-4 py-3.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-3.5 text-right font-semibold">
                  Thao tác
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-[14px]">
              {isError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <p className="text-sm text-red-600">
                      {error instanceof Error
                        ? error.message
                        : "Không thể tải danh mục"}
                    </p>

                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-3 rounded-lg bg-[#FF5E14] px-4 py-2 text-sm font-medium text-white"
                    >
                      Thử lại
                    </button>
                  </td>
                </tr>
              ) : isPending ? (
                Array.from({ length: limit }, (_, index) => (
                  <SkeletonRow key={index} />
                ))
              ) : categories.length ? (
                categories.map((category) => (
                  <tr
                    key={category.id}
                    className="cursor-pointer transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-[#FF5E14]"
                    onClick={() => {
                      setSelectedCategory(category);
                      setIsDetailOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedCategory(category);
                        setIsDetailOpen(true);
                      }
                    }}
                    tabIndex={0}
                    aria-label={`Xem chi tiết danh mục ${category.name}`}
                  >
                    {/* Danh mục */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-orange-50">
                          {category.imageUrl ? (
                            <img
                              src={category.imageUrl}
                              alt={category.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-bold text-[#FF5E14]">
                              {category.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div>
                          <p className="font-medium text-[#0F172A]">
                            {category.name}
                          </p>
                          <p className="mt-1 max-w-[260px] truncate text-[12px] text-[#64748B]">
                            {category.description || "Chưa có mô tả"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Số dịch vụ */}
                    <td className="px-4 py-4 text-[14px] text-[#0F172A]">
                      {category.servicesCount}
                    </td>

                    {/* Ngày cập nhật */}
                    <td className="px-4 py-4 text-[14px] text-[#64748B]">
                      {formatDate(category.updatedAt)}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${
                          category.isActive
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {category.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>

                    {/* Thao tác */}
                    <td
                      className="px-4 py-4 text-right"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label={`Thao tác với ${category.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === category.id}
                        onClick={(event) =>
                          toggleCategoryMenu(event, category.id)
                        }
                        className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-[14px] text-[#64748B]"
                  >
                    Không tìm thấy danh mục phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-[#64748B]">
            Hiển thị {total === 0 ? 0 : (page - 1) * limit + 1}
            {" - "}
            {Math.min(page * limit, total)} trong tổng số {total} danh mục
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => updateQuery({ page: String(page - 1) })}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Trước
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => updateQuery({ page: String(item) })}
                  className={`h-9 min-w-9 rounded-lg px-3 text-sm ${
                    page === item
                      ? "bg-[#FF5E14] text-white"
                      : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {item}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => updateQuery({ page: String(page + 1) })}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* FE-02: Menu render tại document.body, tránh bị bảng cắt mất. */}
      {openMenuId &&
        typeof document !== "undefined" &&
        (() => {
          const menuCategory = categories.find(
            (item) => item.id === openMenuId,
          );
          if (!menuCategory) return null;

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
                aria-label={`Thao tác với ${menuCategory.name}`}
                className="fixed z-[81] w-48 rounded-lg border border-gray-100 bg-white py-1 text-left shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSelectedCategory(menuCategory);
                    setIsDetailOpen(true);
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
                    setSelectedCategory(menuCategory);
                    setIsEditOpen(true);
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
                  disabled={updateCategoryStatus.isPending}
                  onClick={() => {
                    setOpenMenuId(null);
                    void updateCategoryStatus
                      .mutateAsync({
                        id: menuCategory.id,
                        isActive: !menuCategory.isActive,
                      })
                      .catch((error) => {
                        console.error("Lỗi thay đổi trạng thái:", error);
                      });
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 ${
                    menuCategory.isActive ? "text-orange-600" : "text-green-600"
                  }`}
                >
                  <Power size={16} />{" "}
                  {menuCategory.isActive ? "Vô hiệu hóa" : "Kích hoạt"}
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpenMenuId(null);
                    setDeleteError("");
                    setCategoryToDelete(menuCategory);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 size={16} /> Xóa vĩnh viễn
                </button>
              </div>
            </>,
            document.body,
          );
        })()}

      {/* Modals */}
      <AddCatalogModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />

      <EditCatalogModal
        key={selectedCategory?.id}
        isOpen={isEditOpen}
        category={selectedCategory}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedCategory(null);
        }}
      />

      <DetailCatalogModal
        isOpen={isDetailOpen}
        categoryId={selectedCategory?.id}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedCategory(null);
        }}
      />

      {/* Xác nhận xóa vĩnh viễn */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-category-title"
            aria-describedby="delete-category-description"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 size={22} />
            </div>

            <h3
              id="delete-category-title"
              className="text-lg font-bold text-slate-900"
            >
              Xóa vĩnh viễn danh mục?
            </h3>

            <p
              id="delete-category-description"
              className="mt-3 text-sm leading-6 text-slate-600"
            >
              Bạn có chắc muốn xóa danh mục{" "}
              <strong>{categoryToDelete.name}</strong>? Hành động này không thể
              hoàn tác.
            </p>

            <p className="mt-2 text-xs text-slate-500">
              Chỉ có thể xóa nếu danh mục không có danh mục con hoặc dịch vụ.
            </p>

            {deleteError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleteCategory.isPending}
                onClick={() => {
                  setCategoryToDelete(null);
                  setDeleteError("");
                }}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>

              <button
                type="button"
                disabled={deleteCategory.isPending}
                onClick={async () => {
                  if (!categoryToDelete) return;
                  setDeleteError("");
                  try {
                    await deleteCategory.mutateAsync(categoryToDelete.id);
                    setCategoryToDelete(null);
                  } catch (error) {
                    console.error("Lỗi xóa danh mục:", error);
                    setDeleteError(
                      error instanceof Error
                        ? error.message
                        : "Không thể xóa danh mục. Vui lòng thử lại.",
                    );
                  }
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
