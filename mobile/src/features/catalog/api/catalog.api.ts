import type {
  CategoryDetailApiResponse,
  CategoryListApiResponse,
  GetCategoriesParams,
  GetServicesParams,
  ServiceListApiResponse,
} from '../types';
import { ApiClient } from '@/services/api/api-client';

const CATALOG_BASE = '/categories';
const SERVICES_BASE = '/services';

// ─── Category API ─────────────────────────────────────────────────────────────

export const CatalogApi = {
  /**
   * GET /api/v1/categories
   * Fetches paginated list of categories. Public with JWT.
   */
  getCategories: (params: GetCategoriesParams = {}): Promise<CategoryListApiResponse> => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.page !== undefined)
      queryParams.page = params.page;
    if (params.limit !== undefined)
      queryParams.limit = params.limit;
    if (params.search)
      queryParams.search = params.search;
    if (params.isActive !== undefined)
      queryParams.isActive = params.isActive;
    if (params.parentId !== undefined && params.parentId !== null) {
      queryParams.parentId = params.parentId;
    }

    return ApiClient.get<CategoryListApiResponse>(CATALOG_BASE, { params: queryParams });
  },

  /**
   * GET /api/v1/categories/:id
   * Fetches a single category with details.
   */
  getCategoryById: (id: string): Promise<CategoryDetailApiResponse> => {
    return ApiClient.get<CategoryDetailApiResponse>(`${CATALOG_BASE}/${id}`);
  },

  /**
   * GET /api/v1/services
   * Fetches paginated list of services, optionally filtered by categoryId.
   */
  getServices: (params: GetServicesParams = {}): Promise<ServiceListApiResponse> => {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params.page !== undefined)
      queryParams.page = params.page;
    if (params.limit !== undefined)
      queryParams.limit = params.limit;
    if (params.search)
      queryParams.search = params.search;
    if (params.isActive !== undefined)
      queryParams.isActive = params.isActive;
    if (params.categoryId)
      queryParams.categoryId = params.categoryId;

    return ApiClient.get<ServiceListApiResponse>(SERVICES_BASE, { params: queryParams });
  },
};
