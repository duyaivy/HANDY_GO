
export interface CustomerProfile {
  id: string;
  userId: string;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerProfile {
  id: string;
  userId: string;
  status: string;
  averageRating: string;
  ratingCount: number;
  completedOrderCount: number;
  orderCountTotal: number;
  verifiedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserResponse {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  status: string;
  roles?: string[];
  customerProfile?: CustomerProfile | null;
  workerProfile?: WorkerProfile | null;
  bankAccounts?: unknown[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type UserRole = "customer" | "worker" | "all";

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  status?: string;
}

export interface UserPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UserListResponse {
  statusCode: number;
  message: string;
  data: UserResponse[];
  pagination: UserPagination;
}
