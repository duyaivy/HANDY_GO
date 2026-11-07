import type { KycStatus } from "../schema/kyc.schema";

export type KycListConfig = {
  page?: number;
  limit?: number;
  status?: KycStatus;
  search?: string;
  sortBy?: "newest" | "oldest";
};
