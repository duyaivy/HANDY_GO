import type { GetCategoriesParams } from '../types';
import { useQuery } from '@tanstack/react-query';
import { CatalogApi } from '../api/catalog.api';

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const catalogQueryKeys = {
  all: ['catalog'] as const,
  categories: () => [...catalogQueryKeys.all, 'categories'] as const,
  categoriesList: (params: GetCategoriesParams) =>
    [...catalogQueryKeys.categories(), params] as const,
  categoryDetail: (id: string) => [...catalogQueryKeys.categories(), id] as const,
  services: () => [...catalogQueryKeys.all, 'services'] as const,
  servicesList: (params: { page?: number; limit?: number; search?: string; isActive?: boolean; categoryId?: string }) =>
    [...catalogQueryKeys.services(), params] as const,
};

// ─── useCategories ────────────────────────────────────────────────────────────
/**
 * Fetches the paginated list of service categories.
 */
export function useCategories(params: GetCategoriesParams = {}) {
  return useQuery({
    queryKey: catalogQueryKeys.categoriesList(params),
    queryFn: () => CatalogApi.getCategories(params),
    staleTime: 1000 * 60 * 5, // 5 minutes – category data rarely changes
    select: data => data.data,
  });
}

// ─── useCategoryDetail ────────────────────────────────────────────────────────
/**
 * Fetches details for a single category.
 */
export function useCategoryDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: catalogQueryKeys.categoryDetail(id ?? ''),
    queryFn: () => CatalogApi.getCategoryById(id!),
    enabled: Boolean(id),
    staleTime: 1000 * 60 * 5,
    select: data => data.data,
  });
}
