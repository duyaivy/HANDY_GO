export type KycStatus =
  | 'draft'
  | 'submitted'
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type KycFilterStatus = KycStatus | 'all';

export interface KycUser {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  status: string;
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
  user: KycUser;
}

export interface KycRecord {
  id: string;
  workerProfileId: string;
  idDocumentType: string | null;
  idNumberMasked: string | null;
  documentFrontRef: string | null;
  documentBackRef: string | null;
  selfieRef: string | null;
  status: KycStatus;
  version: number;
  idempotencyKey: string | null;
  activeJobId: string | null;
  aiSimilarityScore: number | null;
  rawOcrData: unknown | null;
  aiResult: unknown | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workerProfile: WorkerProfile;
  jobs: unknown[];
  reviewHistories: unknown[];
  reviewer: unknown | null;
}

export const KYC_STATUS_CONFIG: Record<
  KycStatus,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  reviewing: {
    label: 'Chờ xét duyệt',
    badgeBg: 'bg-[#FFE8D6]',
    badgeText: 'text-[#C2410C]',
  },
  submitted: {
    label: 'Chờ xử lý',
    badgeBg: 'bg-[#DBEAFE]',
    badgeText: 'text-[#2563EB]',
  },
  approved: {
    label: 'Đã duyệt',
    badgeBg: 'bg-[#DCFCE7]',
    badgeText: 'text-[#16A34A]',
  },
  rejected: {
    label: 'Từ chối',
    badgeBg: 'bg-[#FEE2E2]',
    badgeText: 'text-[#DC2626]',
  },
  draft: {
    label: 'Nháp',
    badgeBg: 'bg-[#F1F5F9]',
    badgeText: 'text-[#64748B]',
  },
};
