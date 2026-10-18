// export type WorkerStatus = 'active' | 'blocked';

// export interface WorkerItem {
//   id: string;
//   code: string;
//   name: string;
//   phone: string;
//   avatarInitials: string;
//   avatarBg: string;
//   avatarText: string;
//   serviceCategory: string;
//   serviceCategoryBg: string;
//   serviceCategoryColor: string;
//   serviceCategoryBorder: string;
//   rating: number;
//   completedOrders: number;
//   status: WorkerStatus;
//   area?: string;
// }


export type WorkerStatus =
  | "draft"
  | "pending_kyc"
  | "under_review"
  | "verified"
  | "rejected"
  | "suspended";

export type UserStatus = "active" | "suspended" | "deleted";

export type KycStatus =
  | "draft"
  | "submitted"
  | "reviewing"
  | "approved"
  | "rejected";

export interface WorkerItem {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string;

  // Trạng thái tài khoản trong bảng users
  userStatus: UserStatus;

  // Trạng thái hồ sơ thợ trong worker_profiles
  status: WorkerStatus;

  // Thông tin đánh giá và đơn hàng
  rating: number;
  ratingCount: number;
  completedOrders: number;
  totalOrders: number;

  // Thời gian
  createdAt: string;
  verifiedAt?: string;
  approvedAt?: string;

  // Dịch vụ thợ cung cấp
  serviceCategories: string[];

  // Trạng thái KYC
  kycStatus?: KycStatus;

  // Các trường tùy chọn, chỉ dùng nếu có nguồn dữ liệu
  code?: string;
  phone?: string;
  area?: string;
}
