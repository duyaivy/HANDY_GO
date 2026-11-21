import http from "@/shared/api/http";
import queryString from "query-string";
import { ReviewWorkerApplicationBody, WorkerApplication, WorkerApplicationPagination, WorkerApplicationQuery } from "../types/type";


export type WorkerApplicationListResponse = {
  statusCode: number;
  data: WorkerApplication[];
  pagination: WorkerApplicationPagination;
};

export type WorkerApplicationDetailResponse = {
  statusCode: number;
  data: WorkerApplication;
};

export type ReviewWorkerApplicationResponse = {
  statusCode: number;
  message?: string;
  data?: WorkerApplication;
};

const workerApplicationsApiRequest = {
  list: (queryParams: WorkerApplicationQuery) =>
    http.get<WorkerApplicationListResponse>(
      "/api/worker-registrations?" +
        queryString.stringify(queryParams, {
          skipNull: true,
          skipEmptyString: true,
        }),
      {
        baseUrl: "",
      },
    ),

  detail: (id: string) =>
    http.get<WorkerApplicationDetailResponse>(
      `/api/worker-registrations/${encodeURIComponent(id)}`,
      {
        baseUrl: "",
        cache: "no-store",
      },
    ),

  review: (id: string, body: ReviewWorkerApplicationBody) =>
    http.post<ReviewWorkerApplicationResponse>(
      `/api/worker-registrations/${encodeURIComponent(id)}/review`,
      body,
      {
        baseUrl: "",
      },
    ),
};

export default workerApplicationsApiRequest;