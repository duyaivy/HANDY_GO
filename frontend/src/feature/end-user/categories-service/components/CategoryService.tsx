
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { useCategoryListQuery } from "@/feature/catagories/hooks/use-categories";
import { useServiceListQuery } from "@/feature/services/hooks/use-services";

import { CategoryServiceNavbar } from "./CategoryServiceNavbar";
import { ServiceDiscovery } from "./ServiceDiscovery";

const PAGE_SIZE = 8;

export interface CategoryServiceProps {
  onNavigateHome?: () => void;
}

export const CategoryService: React.FC<CategoryServiceProps> = ({
  onNavigateHome,
}) => {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const categoriesQuery = useCategoryListQuery({
    page: "1",
    limit: "100",
    search: "",
    isActive: "true",
  });

  const servicesQuery = useServiceListQuery({
    page: String(page),
    limit: String(PAGE_SIZE),
    isActive: "true",
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(categoryId ? { categoryId } : {}),
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleCategoryChange = (id: string | null) => {
    setCategoryId(id);
    setPage(1);
  };

  const handleNavigateHome = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      router.push("/");
    }
  };

  const handleSelectService = (id: string) => {
    router.push(`/services/${id}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900">
      <CategoryServiceNavbar
        currentView="discovery"
        onSelectView={() => {
          window.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        }}
        onNavigateHome={handleNavigateHome}
      />

      <main className="flex-1">
        <ServiceDiscovery
          categories={categoriesQuery.data?.data ?? []}
          categoriesLoading={categoriesQuery.isPending}
          categoriesError={categoriesQuery.isError}
          categoriesHasMore={
            (categoriesQuery.data?.meta?.totalPages ?? 0) > 1
          }
          services={servicesQuery.data?.data ?? []}
          servicesLoading={
            servicesQuery.isPending || servicesQuery.isFetching
          }
          servicesError={servicesQuery.isError}
          total={servicesQuery.data?.meta?.total ?? 0}
          totalPages={servicesQuery.data?.meta?.totalPages ?? 0}
          page={page}
          onPageChange={setPage}
          search={search}
          onSearchChange={handleSearchChange}
          categoryId={categoryId}
          onCategoryChange={handleCategoryChange}
          onSelectService={handleSelectService}
        />
      </main>
    </div>
  );
};

export default CategoryService;
