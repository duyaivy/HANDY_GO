// ─── Catalog Service DTO Types ──────────────────────────────────────────────
// Derived from GET /docs/specs/catalog-service OpenAPI spec.

export type PaginationMetaDto = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ─── Category DTOs ───────────────────────────────────────────────────────────

export type CategoryResponseDto = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedCategoryDataDto = {
  data: CategoryResponseDto[];
  meta: PaginationMetaDto;
};

export type CategoryListApiResponse = {
  statusCode: number;
  message: string;
  data: PaginatedCategoryDataDto;
};

export type CategoryDetailApiResponse = {
  statusCode: number;
  message: string;
  data: CategoryResponseDto;
};

// ─── Service DTOs ─────────────────────────────────────────────────────────────

export type ServiceCategorySummaryDto = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export type ServiceResponseDto = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: ServiceCategorySummaryDto;
};

export type PaginatedServiceDataDto = {
  data: ServiceResponseDto[];
  meta: PaginationMetaDto;
};

export type ServiceListApiResponse = {
  statusCode: number;
  message: string;
  data: PaginatedServiceDataDto;
};

// ─── Query Parameter Types ────────────────────────────────────────────────────

export type GetCategoriesParams = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  parentId?: string | null;
};

export type GetServicesParams = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  categoryId?: string;
};
