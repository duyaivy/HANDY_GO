import type { GetServicesParams } from '../types';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { CatalogApi } from '../api/catalog.api';
import { catalogQueryKeys } from './use-categories';

const DEFAULT_POPULAR_PARAMS: GetServicesParams = Object.freeze({ limit: 8, isActive: true });

// ─── useServices ──────────────────────────────────────────────────────────────
/**
 * Fetches a paginated list of services, optionally filtered by category.
 */
export function useServices(params: GetServicesParams = {}) {
  return useQuery({
    queryKey: catalogQueryKeys.servicesList(params),
    queryFn: () => CatalogApi.getServices(params),
    staleTime: 1000 * 60 * 3, // 3 minutes
    select: data => data.data,
  });
}

// ─── usePopularServices ───────────────────────────────────────────────────────
/**
 * Fetches a list of services to display in the "Popular Services" section.
 * The backend does not expose a popularity ranking endpoint, so we fetch
 * the first page of active services as a representative listing.
 * NOT presented to users as statistically popular.
 */
export function usePopularServices(limit = 8) {
  const params = React.useMemo<GetServicesParams>(() => {
    if (limit === 8) {
      return DEFAULT_POPULAR_PARAMS;
    }
    return { limit, isActive: true };
  }, [limit]);

  return useServices(params);
}

// ─── useServicesByCategory ────────────────────────────────────────────────────
/**
 * Fetches services for a specific category.
 */
export function useServicesByCategory(categoryId: string | null | undefined, params: Omit<GetServicesParams, 'categoryId'> = {}) {
  const { isActive, limit, page, search } = params;
  const queryParams = React.useMemo<GetServicesParams>(() => ({
    categoryId: categoryId ?? undefined,
    isActive: isActive ?? true,
    limit,
    page,
    search,
  }), [categoryId, isActive, limit, page, search]);

  return useServices(queryParams);
}
