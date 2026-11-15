export type WorkerApplicationStatus = "pending" | "approved" | "rejected";

export type WorkerApplicationSort = "newest" | "oldest";

export interface WorkerApplicationWorker {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  status: string;
}

export interface WorkerApplicationService {
  title: string;
  serviceId: string;
  description: string;
  experienceYears: number;
}

export interface WorkerApplicationServiceArea {
  address: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface WorkerApplicationEvidence {
  url: string;
  name: string;
  fileType: string;
}

export interface WorkerApplicationReviewer {
  id?: string;
  fullName?: string;
}

export interface WorkerApplication {
  id: string;
  version: number;
  workerProfileId: string;
  worker: WorkerApplicationWorker;
  categoryIds: string[];
  services: WorkerApplicationService[];
  serviceArea: WorkerApplicationServiceArea | null;
  evidenceFiles: WorkerApplicationEvidence[];
  status: WorkerApplicationStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewer: WorkerApplicationReviewer | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerApplicationQuery {
  page: number;
  limit: number;
  status?: WorkerApplicationStatus;
  search?: string;
  sortBy?: WorkerApplicationSort;
}

export type ReviewWorkerApplicationBody =
  | {
      decision: "approved";
      reason?: string;
      expectedVersion: number;
    }
  | {
      decision: "rejected";
      reason: string;
      expectedVersion: number;
    };

export interface WorkerApplicationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
