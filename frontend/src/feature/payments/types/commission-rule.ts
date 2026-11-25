export type CreateCommissionRule = {
  ratePercent: string;
  effectiveFrom: string;
  description?: string;
};

export type CommissionRule = {
  id: string;
  ratePercent: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  description: string | null;
  createdAt: string;
};

export type CommissionRulesQuery = { page: number; limit: number };

export type CommissionRulesResponse = CommissionRulesQuery & {
  items: CommissionRule[];
  total: number;
  totalPages: number;
};
