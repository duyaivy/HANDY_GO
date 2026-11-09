export type CustomerStatus = "active" | "suspended" | "deleted";

export interface CustomerItem {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  profileId?: string;
  bio?: string | null;
  email?: string | null;
  phone?: string | null;
}