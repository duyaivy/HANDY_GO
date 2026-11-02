import { z } from "zod";

export const kycStatusSchema = z.enum([
  "draft",
  "submitted",
  "reviewing",
  "approved",
  "rejected",
]);

export type KycStatus = z.infer<typeof kycStatusSchema>;
export type KycFilterStatus = KycStatus | "all";

export const kycUserSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const workerProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.string(),
  averageRating: z.string(),
  ratingCount: z.number(),
  completedOrderCount: z.number(),
  orderCountTotal: z.number(),
  verifiedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  user: kycUserSchema,
});

export const kycSchema = z.object({
  id: z.string(),
  workerProfileId: z.string(),

  idDocumentType: z.string().nullable(),
  idNumberMasked: z.string().nullable(),

  documentFrontRef: z.string().nullable(),
  documentBackRef: z.string().nullable(),
  selfieRef: z.string().nullable(),

  status: kycStatusSchema,
  version: z.number(),

  idempotencyKey: z.string().nullable(),
  activeJobId: z.string().nullable(),

  aiSimilarityScore: z
    .union([z.string(), z.number()])
    .nullable(),

  rawOcrData: z.unknown().nullable(),
  aiResult: z.unknown().nullable(),

  reviewedByUserId: z.string().nullable(),
  reviewNote: z.string().nullable(),

  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),

  workerProfile: workerProfileSchema,
  jobs: z.array(z.unknown()),
  reviewer: z.unknown().nullable(),
});

export const kycDetailSchema = kycSchema.extend({
  reviewHistories: z.array(z.unknown()),
});

export type KycResType = z.infer<typeof kycSchema>;
export type KycDetailResType = z.infer<typeof kycDetailSchema>;

export type ReviewKycBodyType = {
  decision: "approved" | "rejected";
  note: string;
};