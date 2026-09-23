export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
};

export type PaginationParams = {
  page?: number;
  pageSize?: number;
};
