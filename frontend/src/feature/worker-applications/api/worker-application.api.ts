import http from "@/shared/api/http";
import queryString from "query-string";

export interface WorkerServiceRegistrationItem {
  id: string;
  workerProfileId: string;
  workerProfile: {
    user: {
      id: string;
      fullName: string;
      avatarUrl: string | null;
      status: string;
    };
  };
  reviewer: {
    id: string;
    fullName: string;
  } | null;
  categoryIds: string[];
  services: Array<{
    serviceId: string;
    serviceName: string;
    categoryId: string;
    categoryName: string;
    title: string;
    description: string | null;
    experienceYears: number;
  }>;
  serviceArea: Record<string, unknown>;
  evidenceFiles: Array<{
    url: string;
    fileType: string;
  }>;
  status: "pending" | "approved" | "rejected";
  version: number;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewWorkerRegistrationBody {
  decision: "approved" | "rejected";
  reason?: string;
  expectedVersion: number;
}

export interface WorkerRegistrationListResponse {
  statusCode: number;
  data: WorkerServiceRegistrationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WorkerRegistrationDetailResponse {
  statusCode: number;
  data: WorkerServiceRegistrationItem;
}

export interface WorkerRegistrationReviewResponse {
  statusCode: number;
  message: string;
  data: WorkerServiceRegistrationItem;
}

export const workerApplicationApiRequest = {
  list: (queryParams: { page?: number; limit?: number; status?: string }) =>
    http.get<WorkerRegistrationListResponse>(
      "/api/v1/admin/worker-registrations?" + queryString.stringify(queryParams),
      { baseUrl: "" },
    ),

  detail: (id: string) =>
    http.get<WorkerRegistrationDetailResponse>(
      `/api/v1/admin/worker-registrations/${encodeURIComponent(id)}`,
      {
        baseUrl: "",
        cache: "no-store",
      },
    ),

  review: (id: string, body: ReviewWorkerRegistrationBody) =>
    http.post<WorkerRegistrationReviewResponse>(
      `/api/v1/admin/worker-registrations/${encodeURIComponent(id)}/review`,
      body,
      { baseUrl: "" },
    ),
};

export default workerApplicationApiRequest;
