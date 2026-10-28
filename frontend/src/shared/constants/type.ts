
export type SuccessResponse<T> = {
  statusCode: number;
  message: string;
  data: T;
};

export type FailureResponse = {
  statusCode: number;
  code?: string;
  message: string;
  data?: unknown;
};

export type PaginationResponse<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
