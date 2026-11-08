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
  customerProfile?: CustomerProfile | null;
  workerProfile?: WorkerProfile | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}
