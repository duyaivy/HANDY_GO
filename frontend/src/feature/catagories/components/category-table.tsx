
'use client';

import React, { useMemo, useState } from 'react';
import { Search, Plus, MoreVertical, Eye, Pencil, Power } from 'lucide-react';
import DetailCatalogModal from './detail-catagory';
import AddCatalogModal from './add-catagory';

import { CategoryItem } from '../types';
import { EditCatalogModal } from './edit-catagory';



type StatusFilter = 'all' | 'active' | 'disabled';

const DEFAULT_CATEGORIES: CategoryItem[] = [
  {
    id: '1',
    code: 'CAT-01',
    parentId: null,
    name: 'Điện lạnh',
    description: 'Các dịch vụ sửa chữa và bảo trì thiết bị điện lạnh',
    imageUrl: '/images/catalogs/electric.png',
    servicesCount: 12,
    isActive: true,
    createdAt: '2026-09-01',
    updatedAt: '2026-10-01',
  },
  {
    id: '2',
    code: 'CAT-02',
    parentId: null,
    name: 'Điện nước',
    description: 'Các dịch vụ sửa chữa hệ thống điện và nước',
    imageUrl: '/images/catalogs/plumbing.png',
    servicesCount: 8,
    isActive: true,
    createdAt: '2026-09-02',
    updatedAt: '2026-10-02',
  },
  {
    id: '3',
    code: 'CAT-03',
    parentId: null,
    name: 'Vệ sinh nhà cửa',
    description: 'Các dịch vụ vệ sinh và dọn dẹp nhà cửa',
    imageUrl: '/images/catalogs/cleaning.png',
    servicesCount: 15,
    isActive: true,
    createdAt: '2026-09-03',
    updatedAt: '2026-10-03',
  },
  {
    id: '4',
    code: 'CAT-04',
    parentId: null,
    name: 'Sửa chữa nội thất',
    description: 'Các dịch vụ sửa chữa đồ nội thất trong nhà',
    imageUrl: '/images/catalogs/furniture.png',
    servicesCount: 6,
    isActive: false,
    createdAt: '2026-09-04',
    updatedAt: '2026-10-04',
  },
  {
    id: '5',
    code: 'CAT-05',
    parentId: null,
    name: 'Lắp đặt thiết bị',
    description: 'Các dịch vụ lắp đặt thiết bị gia đình',
    imageUrl: '/images/catalogs/installation.png',
    servicesCount: 10,
    isActive: true,
    createdAt: '2026-09-05',
    updatedAt: '2026-10-05',
  },
];

export interface CategoryTableProps {
  categories?: CategoryItem[];
  onCategoriesChange?: (categories: CategoryItem[]) => void;
}

export const CategoryTable: React.FC<CategoryTableProps> = ({
  categories: initialCategories,
  onCategoriesChange,
}) => {
  const [categories, setCategories] = useState<CategoryItem[]>(
    initialCategories ?? DEFAULT_CATEGORIES,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const itemsPerPage = 5;

  const updateCategories = (nextCategories: CategoryItem[]) => {
    setCategories(nextCategories);
    onCategoriesChange?.(nextCategories);
  };

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const keyword = searchTerm.trim().toLowerCase();

      const matchesSearch =
        !keyword ||
        category.name.toLowerCase().includes(keyword) ||
        (category.code ?? '').toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && category.isActive) ||
        (statusFilter === 'disabled' && !category.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [categories, searchTerm, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCategories.length / itemsPerPage),
  );

  const paginatedCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;

    return filteredCategories.slice(
      startIndex,
      startIndex + itemsPerPage,
    );
  }, [filteredCategories, currentPage]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const handleToggleStatus = (category: CategoryItem) => {
    const nextCategories = categories.map((item) =>
      item.id === category.id
        ? {
            ...item,
            isActive: !item.isActive,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );

    updateCategories(nextCategories);
    setOpenMenuId(null);
  };

  const handleAddCategory = (newCategory: {
    name: string;
    description?: string;
    status: 'Active' | 'Disabled';
    imageUrl: string;
  }) => {
    const now = new Date().toISOString();

    const category: CategoryItem = {
      id: crypto.randomUUID(),
      code: `CAT-${String(categories.length + 1).padStart(2, '0')}`,
      parentId: null,
      name: newCategory.name,
      description: newCategory.description || null,
      imageUrl: newCategory.imageUrl || null,
      servicesCount: 0,
      isActive: newCategory.status === 'Active',
      createdAt: now,
      updatedAt: now,
    };

    updateCategories([category, ...categories]);
    setCurrentPage(1);
    setIsAddModalOpen(false);
  };

  const handleEditCategory = (updatedCategory: CategoryItem) => {
    const nextCategories = categories.map((category) =>
      category.id === updatedCategory.id
        ? {
            ...category,
            ...updatedCategory,
            updatedAt: new Date().toISOString(),
          }
        : category,
    );

    updateCategories(nextCategories);
    setIsEditModalOpen(false);
    setSelectedCategory(null);
  };

  const handleOpenDetail = (category: CategoryItem) => {
    setSelectedCategory(category);
    setIsDetailModalOpen(true);
    setOpenMenuId(null);
  };

  const handleOpenEdit = (category: CategoryItem) => {
    setSelectedCategory(category);
    setIsEditModalOpen(true);
    setOpenMenuId(null);
  };

  const formatDate = (date: string) => {
    if (!date) return '—';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleDateString('vi-VN');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Quản lý danh mục dịch vụ
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Quản lý các danh mục dịch vụ trên hệ thống HandyGo
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
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
              value={searchTerm}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Tìm kiếm danh mục..."
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#FF5E14]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              handleStatusFilterChange(event.target.value as StatusFilter)
            }
            className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#FF5E14]"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="disabled">Đã vô hiệu hóa</option>
          </select>
        </div>

        <p className="mt-4 text-sm font-semibold text-gray-800">
          Danh sách danh mục ({filteredCategories.length})
        </p>

        {/* Table */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase text-gray-500">
                <th className="px-4 py-3 font-medium">Danh mục</th>
                <th className="px-4 py-3 font-medium">Mã danh mục</th>
                <th className="px-4 py-3 font-medium">Số dịch vụ</th>
                <th className="px-4 py-3 font-medium">Cập nhật lần cuối</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {paginatedCategories.map((category) => (
                <tr
                  key={category.id}
                  className="transition hover:bg-gray-50"
                >
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
                        <p className="font-semibold text-gray-900">
                          {category.name}
                        </p>
                        <p className="mt-1 max-w-[260px] truncate text-xs text-gray-500">
                          {category.description || 'Chưa có mô tả'}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500">
                    {category.code ?? '—'}
                  </td>

                  <td className="px-4 py-4 text-sm text-gray-700">
                    {category.servicesCount}
                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500">
                    {formatDate(category.updatedAt)}
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        category.isActive
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {category.isActive
                        ? 'Đang hoạt động'
                        : 'Đã vô hiệu hóa'}
                    </span>
                  </td>

                  <td className="px-4 py-4 text-right">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenuId(
                            openMenuId === category.id ? null : category.id,
                          )
                        }
                        className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100"
                        aria-label={`Thao tác với ${category.name}`}
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openMenuId === category.id && (
                        <>
                          <button
                            type="button"
                            aria-label="Đóng menu thao tác"
                            className="fixed inset-0 z-10 cursor-default"
                            onClick={() => setOpenMenuId(null)}
                          />

                          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-100 bg-white py-1 text-left shadow-lg">
                            <button
                              type="button"
                              onClick={() => handleOpenDetail(category)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Eye size={16} />
                              Xem chi tiết
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEdit(category)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil size={16} />
                              Chỉnh sửa
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleStatus(category)}
                              className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 ${
                                category.isActive
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }`}
                            >
                              <Power size={16} />
                              {category.isActive
                                ? 'Vô hiệu hóa'
                                : 'Kích hoạt'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {paginatedCategories.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-gray-500"
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
          <p className="text-sm text-gray-500">
            Hiển thị{' '}
            {filteredCategories.length === 0
              ? 0
              : (currentPage - 1) * itemsPerPage + 1}
            {' - '}
            {Math.min(currentPage * itemsPerPage, filteredCategories.length)}{' '}
            trong tổng số {filteredCategories.length} danh mục
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Trước
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <button
                  type="button"
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`h-9 min-w-9 rounded-lg px-3 text-sm ${
                    currentPage === page
                      ? 'bg-[#FF5E14] text-white'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() =>
                setCurrentPage((page) => Math.min(totalPages, page + 1))
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddCatalogModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddCatalog={handleAddCategory}
      />

      <EditCatalogModal
      key={selectedCategory?.id}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedCategory(null);
        }}
        category={selectedCategory}
        onSave={handleEditCategory}
      />

      <DetailCatalogModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedCategory(null);
        }}
        category={selectedCategory}
      />
    </div>
  );
};
