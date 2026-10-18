"use client";

import React, { useMemo, useState } from "react";
import { Plus, Search, Layers, ChevronDown, Power } from "lucide-react";

import { ServiceCategory, ServiceFormData, ServiceItem } from "../types";

import ServiceCard from "./service-card";
import AddServiceModal from "./add-service";
import EditServiceModal from "./edit-service";
import DetailServiceModal from "./detail-service";

const initialCategories: ServiceCategory[] = [
  { id: "cat-1", name: "Điện" },
  { id: "cat-2", name: "Nước" },
  { id: "cat-3", name: "Điện lạnh" },
  { id: "cat-4", name: "Vệ sinh" },
  { id: "cat-5", name: "Sửa chữa nhà" },
  { id: "cat-6", name: "Lắp đặt" },
];

const initialServices: ServiceItem[] = [
  {
    id: "ser-1",
    categoryId: "cat-1",
    name: "Sửa điện",
    description: "Kiểm tra và sửa chữa sự cố điện dân dụng.",
    iconUrl: null,
    isActive: true,
    createdAt: "2026-09-20T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  },
  {
    id: "ser-2",
    categoryId: "cat-1",
    name: "Lắp đèn",
    description: "Lắp đặt đèn chiếu sáng trong nhà.",
    iconUrl: null,
    isActive: true,
    createdAt: "2026-09-21T08:00:00.000Z",
    updatedAt: "2026-10-02T08:00:00.000Z",
  },
  {
    id: "ser-3",
    categoryId: "cat-1",
    name: "Sửa ổ cắm",
    description: "Kiểm tra và sửa chữa ổ cắm điện.",
    iconUrl: null,
    isActive: false,
    createdAt: "2026-09-22T08:00:00.000Z",
    updatedAt: "2026-10-03T08:00:00.000Z",
  },
  {
    id: "ser-4",
    categoryId: "cat-2",
    name: "Sửa vòi nước",
    description: "Sửa chữa vòi nước bị rò rỉ.",
    iconUrl: null,
    isActive: true,
    createdAt: "2026-09-23T08:00:00.000Z",
    updatedAt: "2026-10-04T08:00:00.000Z",
  },
  {
    id: "ser-5",
    categoryId: "cat-2",
    name: "Thông tắc cống",
    description: "Xử lý tắc nghẽn đường ống thoát nước.",
    iconUrl: null,
    isActive: true,
    createdAt: "2026-09-24T08:00:00.000Z",
    updatedAt: "2026-10-05T08:00:00.000Z",
  },
  {
    id: "ser-6",
    categoryId: "cat-3",
    name: "Sửa máy lạnh",
    description: "Kiểm tra và sửa chữa máy lạnh tại nhà.",
    iconUrl: null,
    isActive: true,
    createdAt: "2026-09-25T08:00:00.000Z",
    updatedAt: "2026-10-06T08:00:00.000Z",
  },
  {
    id: "ser-7",
    categoryId: "cat-3",
    name: "Vệ sinh máy lạnh",
    description: "Vệ sinh và bảo dưỡng máy lạnh định kỳ.",
    iconUrl: null,
    isActive: true,
    createdAt: "2026-09-26T08:00:00.000Z",
    updatedAt: "2026-10-07T08:00:00.000Z",
  },
  {
    id: "ser-8",
    categoryId: "cat-4",
    name: "Vệ sinh nhà",
    description: "Dọn dẹp không gian sinh hoạt.",
    iconUrl: null,
    isActive: true,
    createdAt: "2026-09-27T08:00:00.000Z",
    updatedAt: "2026-10-08T08:00:00.000Z",
  },
];

type ModalMode = "add" | "edit" | "detail" | null;

export default function ServiceTable() {
  const [categories] = useState(initialCategories);
  const [services, setServices] = useState(initialServices);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(
    null,
  );

  const activeCount = services.filter((service) => service.isActive).length;
  const disabledCount = services.length - activeCount;

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const keyword = search.trim().toLowerCase();

      const matchesSearch =
        service.name.toLowerCase().includes(keyword) ||
        (service.description ?? "").toLowerCase().includes(keyword);

      const matchesCategory =
        categoryFilter === "all" || service.categoryId === categoryFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && service.isActive) ||
        (statusFilter === "disabled" && !service.isActive);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [services, search, categoryFilter, statusFilter]);

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

  const handleAddService = (data: ServiceFormData) => {
    const now = new Date().toISOString();

    const newService: ServiceItem = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    setServices((current) => [newService, ...current]);
    setCategoryFilter("all");
    setStatusFilter("all");
    setSearch("");
    closeModal();
  };

  const handleEditService = (data: ServiceFormData) => {
    if (!selectedService) return;

    setServices((current) =>
      current.map((service) =>
        service.id === selectedService.id
          ? {
              ...service,
              ...data,
              updatedAt: new Date().toISOString(),
            }
          : service,
      ),
    );

    closeModal();
  };

  const handleToggleStatus = (service: ServiceItem) => {
    setServices((current) =>
      current.map((item) =>
        item.id === service.id
          ? {
              ...item,
              isActive: !item.isActive,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
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
          value={services.length}
          icon={<Layers size={20} />}
          color="orange"
        />

        <SummaryCard
          title="Đang hoạt động"
          value={activeCount}
          icon={<Power size={20} />}
          color="green"
        />

        <SummaryCard
          title="Đã vô hiệu hóa"
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
              Tổng cộng {filteredServices.length} dịch vụ
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm tên dịch vụ..."
                className="w-full min-w-0 rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            {/* CATEGORY FILTER */}
            <div className="relative min-w-0">
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
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
                onChange={(event) => setStatusFilter(event.target.value)}
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
          {categories
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
          {filteredServices.length === 0 && (
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
                  setCategoryFilter("all");
                  setStatusFilter("all");
                }}
                className="mt-4 text-sm font-semibold text-[#FF5E14] hover:underline"
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ADD MODAL */}
      {modalMode === "add" && (
        <AddServiceModal
          key="add-service"
          isOpen
          onClose={closeModal}
          categories={categories}
          onAdd={handleAddService}
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
