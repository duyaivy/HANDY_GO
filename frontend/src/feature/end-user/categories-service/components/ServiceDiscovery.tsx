"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Inbox,
  ArrowRight,
} from "lucide-react";
import { motion } from "motion/react";

import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryResType } from "@/feature/catagories/schema/category.schema";
import type { ServiceResType } from "@/feature/services/schema/service.schema";
import { DownloadAppSection } from "./DownloadAppSection";
import { Footer } from "@/feature/landing-page/components/Footer";

export interface ServiceDiscoveryProps {
  categories: CategoryResType[];
  categoriesLoading: boolean;
  categoriesError: boolean;
  categoriesHasMore: boolean;

  services: ServiceResType[];
  servicesLoading: boolean;
  servicesError: boolean;

  total: number;
  totalPages: number;
  page: number;
  onPageChange: (page: number) => void;

  search: string;
  onSearchChange: (value: string) => void;

  categoryId: string | null;
  onCategoryChange: (id: string | null) => void;

  onSelectService: (id: string) => void;
}

const CATEGORY_ANIMATION = {
  type: "tween" as const,
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1] as const,
};

const subscribeToViewport = (callback: () => void) => {
  const mediaQueries = [
    window.matchMedia("(max-width: 639px)"),
    window.matchMedia("(min-width: 640px) and (max-width: 1023px)"),
    window.matchMedia("(min-width: 1024px)"),
  ];

  mediaQueries.forEach((query) => query.addEventListener("change", callback));

  return () => {
    mediaQueries.forEach((query) =>
      query.removeEventListener("change", callback),
    );
  };
};

const getCategoriesPerPage = () => {
  if (window.innerWidth < 640) return 2;
  if (window.innerWidth < 1024) return 4;
  return 8;
};

const getServerCategoriesPerPage = () => 8;

const useCategoriesPerPage = () =>
  useSyncExternalStore(
    subscribeToViewport,
    getCategoriesPerPage,
    getServerCategoriesPerPage,
  );

const ServiceCardSkeleton = () => (
  <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <Skeleton className="mb-4 h-[180px] w-full rounded-xl" />
    <Skeleton className="mb-3 h-3 w-24 rounded-md" />
    <Skeleton className="mb-3 h-5 w-3/4 rounded-md" />

    <div className="space-y-2">
      <Skeleton className="h-3 w-full rounded-md" />
      <Skeleton className="h-3 w-full rounded-md" />
      <Skeleton className="h-3 w-2/3 rounded-md" />
    </div>
  </div>
);

const getPaginationItems = (
  currentPage: number,
  totalPages: number,
): (number | string)[] => {
  const visiblePages = Array.from(
    { length: totalPages },
    (_, index) => index + 1,
  ).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2,
  );

  const items: (number | string)[] = [];

  visiblePages.forEach((p, index) => {
    const previousPage = visiblePages[index - 1];

    if (previousPage !== undefined) {
      const gap = p - previousPage;

      if (gap === 2) {
        items.push(previousPage + 1);
      } else if (gap > 2) {
        items.push("...");
      }
    }

    items.push(p);
  });

  return items;
};

export const ServiceDiscovery: React.FC<ServiceDiscoveryProps> = ({
  categories,
  categoriesLoading,
  categoriesError,
  categoriesHasMore,
  services,
  servicesLoading,
  servicesError,
  total,
  totalPages,
  page,
  onPageChange,
  search,
  onSearchChange,
  categoryId,
  onCategoryChange,
  onSelectService,
}) => {
  const [draftSearch, setDraftSearch] = useState(search);
  const [categoryPage, setCategoryPage] = useState(0);
  const categoriesPerPage = useCategoriesPerPage();

  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (draftSearch === search) return;

    const timer = window.setTimeout(() => {
      onSearchChange(draftSearch);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [draftSearch, search, onSearchChange]);

  const totalCategoryPages = Math.ceil(categories.length / categoriesPerPage);

  const currentCategoryPage = Math.min(
    categoryPage,
    Math.max(totalCategoryPages - 1, 0),
  );

  const handlePreviousCategory = () => {
    setCategoryPage(Math.max(currentCategoryPage - 1, 0));
  };

  const handleNextCategory = () => {
    setCategoryPage(Math.min(currentCategoryPage + 1, totalCategoryPages - 1));
  };

  const handleCategoryTouchStart = (
    event: React.TouchEvent<HTMLDivElement>,
  ) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleCategoryTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;

    const touchEndX = event.changedTouches[0].clientX;
    const distance = touchStartX.current - touchEndX;

    if (Math.abs(distance) > 50) {
      if (distance > 0) {
        handleNextCategory();
      } else {
        handlePreviousCategory();
      }
    }

    touchStartX.current = null;
  };

  const scrollToServices = () => {
    document.getElementById("services-list")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleCategoryChange = (id: string | null) => {
    onCategoryChange(id);
    scrollToServices();
  };

  const handleResetFilters = () => {
    setDraftSearch("");
    onSearchChange("");
    onCategoryChange(null);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearchChange(draftSearch);
    scrollToServices();
  };

  const paginationItems = getPaginationItems(page, totalPages);

  return (
    <div>
      {/* TÌM KIẾM */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-5">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">
              Khám phá <span className="text-[#FF5E14]">dịch vụ HandyGo</span>
            </h1>

            <p className="text-sm text-slate-500 sm:text-base">
              Tìm kiếm dịch vụ phù hợp với nhu cầu của bạn.
            </p>

            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row"
            >
              <div className="flex flex-1 items-center gap-3 px-3">
                <Search className="h-5 w-5 shrink-0 text-slate-400" />

                <input
                  type="text"
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder="Tìm kiếm dịch vụ..."
                  className="w-full bg-transparent py-3 text-sm outline-none"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5E14] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#E04F0E]"
              >
                Tìm kiếm
                <ArrowRight size={17} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* DANH MỤC DỊCH VỤ */}
      <section className="overflow-hidden bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
              Danh mục dịch vụ
            </h2>

            {!categoriesLoading &&
              !categoriesError &&
              totalCategoryPages > 1 && (
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs font-medium text-slate-400 sm:block">
                    {currentCategoryPage + 1}/{totalCategoryPages}
                  </span>

                  <button
                    type="button"
                    onClick={handlePreviousCategory}
                    disabled={currentCategoryPage === 0}
                    aria-label="Danh mục trước"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF5E14] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft size={21} />
                  </button>

                  <button
                    type="button"
                    onClick={handleNextCategory}
                    disabled={currentCategoryPage >= totalCategoryPages - 1}
                    aria-label="Danh mục tiếp theo"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF5E14] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight size={21} />
                  </button>
                </div>
              )}
          </div>

          {categoriesLoading ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-8">
              {Array.from({
                length: categoriesPerPage,
              }).map((_, index) => (
                <div key={index} className="flex flex-col items-center gap-3">
                  <Skeleton className="h-24 w-24 rounded-full sm:h-28 sm:w-28" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : categoriesError ? (
            <p className="text-sm text-red-600">Không tải được danh mục.</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có danh mục.</p>
          ) : (
            <>
              <div
                className="overflow-hidden touch-pan-y"
                onTouchStart={handleCategoryTouchStart}
                onTouchEnd={handleCategoryTouchEnd}
              >
                <motion.div
                  className="flex"
                  animate={{
                    x: `-${currentCategoryPage * 100}%`,
                  }}
                  transition={CATEGORY_ANIMATION}
                >
                  {Array.from({
                    length: totalCategoryPages,
                  }).map((_, pageIndex) => {
                    const pageCategories = categories.slice(
                      pageIndex * categoriesPerPage,
                      (pageIndex + 1) * categoriesPerPage,
                    );

                    return (
                      <div
                        key={pageIndex}
                        className="grid w-full shrink-0 grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-8"
                      >
                        {pageCategories.map((category) => {
                          const isSelected = categoryId === category.id;

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() =>
                                handleCategoryChange(
                                  isSelected ? null : category.id,
                                )
                              }
                              className="group flex min-w-0 flex-col items-center gap-3 text-center"
                            >
                              <div
                                className={`flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 transition-all duration-300 group-hover:scale-105 sm:h-28 sm:w-28 ${
                                  isSelected
                                    ? "border-[#FF5E14] bg-orange-50 ring-4 ring-orange-100"
                                    : "border-slate-200 bg-[#FFF4EC] group-hover:border-[#FF5E14]"
                                }`}
                              >
                                {category.imageUrl ? (
                                  <img
                                    src={category.imageUrl}
                                    alt={category.name}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <span className="text-3xl font-bold text-[#FF5E14]">
                                    {category.name.charAt(0)}
                                  </span>
                                )}
                              </div>

                              <span
                                className={`max-w-28 text-sm font-bold transition-colors ${
                                  isSelected
                                    ? "text-[#FF5E14]"
                                    : "text-slate-900 group-hover:text-[#FF5E14]"
                                }`}
                              >
                                {category.name}
                              </span>

                              <span className="text-xs text-slate-400">
                                {category._count.services} dịch vụ
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </motion.div>
              </div>

              {totalCategoryPages > 1 && (
                <div className="mt-7 flex items-center justify-center gap-2">
                  {Array.from({
                    length: totalCategoryPages,
                  }).map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCategoryPage(index)}
                      aria-label={`Đến nhóm danh mục ${index + 1}`}
                      aria-current={
                        currentCategoryPage === index ? "true" : undefined
                      }
                      className={`h-2 rounded-full transition-all duration-300 ${
                        currentCategoryPage === index
                          ? "w-7 bg-[#FF5E14]"
                          : "w-2 bg-slate-200 hover:bg-orange-200"
                      }`}
                    />
                  ))}
                </div>
              )}

              {categoriesHasMore && (
                <p className="mt-4 text-center text-xs text-slate-400">
                  Đang hiển thị các danh mục đã tải từ hệ thống.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* DANH SÁCH DỊCH VỤ */}
      <section id="services-list" className="scroll-mt-24 bg-slate-50/70 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
              Danh sách dịch vụ
            </h2>

            {!servicesLoading && !servicesError && (
              <p className="mt-1 text-sm text-slate-500">
                Tìm thấy {total} dịch vụ
              </p>
            )}
          </div>

          {/* BỘ LỌC */}
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                type="text"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                placeholder="Lọc dịch vụ..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-500"
              />
            </div>

            <div className="relative min-w-[170px]">
              <select
                value={categoryId ?? ""}
                onChange={(event) =>
                  handleCategoryChange(event.target.value || null)
                }
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm outline-none focus:border-orange-500"
              >
                <option value="">Tất cả danh mục</option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>

              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              <RotateCcw size={16} />
              Xóa bộ lọc
            </button>
          </div>

          {/* GRID DỊCH VỤ */}
          {servicesLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <ServiceCardSkeleton key={index} />
              ))}
            </div>
          ) : servicesError ? (
            <p className="rounded-2xl bg-white p-10 text-center text-sm text-red-600">
              Không tải được dịch vụ.
            </p>
          ) : services.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center">
              <Inbox className="mx-auto mb-3 h-8 w-8 text-[#FF5E14]" />

              <p className="font-bold text-slate-900">Không tìm thấy dịch vụ</p>

              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-3 text-sm font-semibold text-[#FF5E14]"
              >
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => onSelectService(service.id)}
                  className="group h-full overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-lg"
                >
                  <div className="mb-4 flex h-[180px] w-full items-center justify-center overflow-hidden rounded-xl bg-white p-3">
                    {service.iconUrl ? (
                      <img
                        src={service.iconUrl}
                        alt={service.name}
                        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                        Chưa có hình ảnh
                      </div>
                    )}
                  </div>

                  {service.category?.name && (
                    <p className="mb-2 text-xs font-semibold text-[#FF5E14]">
                      {service.category.name}
                    </p>
                  )}

                  <h3 className="text-base font-extrabold text-slate-900 transition-colors group-hover:text-[#FF5E14]">
                    {service.name}
                  </h3>

                  {service.description && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-500">
                      {service.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* PHÂN TRANG */}
          {!servicesLoading && !servicesError && totalPages > 1 && (
            <nav
              aria-label="Phân trang dịch vụ"
              className="mt-8 flex flex-wrap items-center justify-center gap-2"
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  onPageChange(page - 1);
                  scrollToServices();
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Trước
              </button>

              {paginationItems.map((item, index) =>
                item === "..." ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex h-9 min-w-9 items-center justify-center text-sm font-bold text-slate-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      onPageChange(Number(item));
                      scrollToServices();
                    }}
                    aria-current={page === item ? "page" : undefined}
                    className={`h-9 min-w-9 rounded-lg px-2 text-sm font-bold transition-colors ${
                      page === item
                        ? "bg-[#FF5E14] text-white"
                        : "bg-white text-slate-700 hover:bg-orange-50"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => {
                  onPageChange(page + 1);
                  scrollToServices();
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
              </button>
            </nav>
          )}
        </div>
      </section>

      <DownloadAppSection />
      <Footer
        onOpenDownload={() => {
          const section = document.getElementById("download-app");

          if (section) {
            section.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          } else {
            window.location.href = "/services#download-app";
          }
        }}
      />
    </div>
  );
};

export default ServiceDiscovery;
