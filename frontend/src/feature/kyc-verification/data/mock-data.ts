import { KycRecord } from '../types/type';

export const INITIAL_KYC_RECORDS: KycRecord[] = [
  {
    id: 'f81029bc-77c4-498b-8550-477ddb25f388', workerProfileId: '8f8c1f0f-6b4a-4c6d-a7b3-1f8a2d5c4e20', idDocumentType: 'CCCD', idNumberMasked: '0790******78',
    documentFrontRef: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80', documentBackRef: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80', selfieRef: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
    status: 'reviewing', version: 1, idempotencyKey: null, activeJobId: '7e9b2c31-92c8-4d2f-9ad4-60a4a8e6b521', aiSimilarityScore: 0.86, rawOcrData: { documentType: 'CCCD', matchStatus: 'review-ready' }, aiResult: { similarity: 0.86, documentMatch: true }, reviewedByUserId: null, reviewNote: null,
    submittedAt: '2026-10-24T17:55:51.321Z', reviewedAt: null, createdAt: '2026-10-24T17:55:51.321Z', updatedAt: '2026-10-24T17:55:51.321Z',
    workerProfile: { id: '8f8c1f0f-6b4a-4c6d-a7b3-1f8a2d5c4e20', userId: '5c4d3ab2-8f01-4e55-9a10-2be341ab9c77', status: 'ACTIVE', averageRating: '4.92', ratingCount: 48, completedOrderCount: 45, orderCountTotal: 52, verifiedAt: '2026-10-20T08:10:00.000Z', approvedAt: null, createdAt: '2026-10-20T08:10:00.000Z', updatedAt: '2026-10-24T17:55:51.321Z', user: { id: '5c4d3ab2-8f01-4e55-9a10-2be341ab9c77', fullName: 'Trần Minh Hoàng', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80', status: 'ACTIVE', createdAt: '2026-10-20T08:10:00.000Z', updatedAt: '2026-10-24T17:55:51.321Z' } }, jobs: [], reviewHistories: [], reviewer: null,
  },
  {
    id: 'a319f61b-8521-4d32-9cb1-8012bb5021fa', workerProfileId: '2bc9e7aa-6d1e-4eb8-9f32-5c0a7e4d128b', idDocumentType: 'CCCD', idNumberMasked: '0791******23',
    documentFrontRef: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80', documentBackRef: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80', selfieRef: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    status: 'submitted', version: 1, idempotencyKey: 'b092d9d0-c4df-4eec-8365-a18e40c0b00f', activeJobId: '9a42b721-0ef9-4e56-bbce-20f7ad11f0bd', aiSimilarityScore: null, rawOcrData: null, aiResult: null, reviewedByUserId: null, reviewNote: null,
    submittedAt: '2026-10-24T14:20:00.000Z', reviewedAt: null, createdAt: '2026-10-24T14:20:00.000Z', updatedAt: '2026-10-24T14:20:00.000Z',
    workerProfile: { id: '2bc9e7aa-6d1e-4eb8-9f32-5c0a7e4d128b', userId: '7b4e5d13-4dcb-4aa7-9fbe-34a4fe1a0022', status: 'ACTIVE', averageRating: '4.85', ratingCount: 36, completedOrderCount: 32, orderCountTotal: 39, verifiedAt: null, approvedAt: null, createdAt: '2026-10-19T09:00:00.000Z', updatedAt: '2026-10-24T14:20:00.000Z', user: { id: '7b4e5d13-4dcb-4aa7-9fbe-34a4fe1a0022', fullName: 'Nguyễn Thị Lan', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80', status: 'ACTIVE', createdAt: '2026-10-19T09:00:00.000Z', updatedAt: '2026-10-24T14:20:00.000Z' } }, jobs: [], reviewHistories: [], reviewer: null,
  },
  {
    id: 'c189b02a-4318-4721-a128-44917cc88231', workerProfileId: 'e9e7a4ce-76f3-43ac-a9a8-6504e721cc41', idDocumentType: 'CCCD', idNumberMasked: '0010******47',
    documentFrontRef: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80', documentBackRef: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80', selfieRef: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
    status: 'approved', version: 2, idempotencyKey: '5bb71d3e-ceb1-40a1-9773-6cfa2fc71910', activeJobId: null, aiSimilarityScore: 0.98, rawOcrData: { extracted: true }, aiResult: { accepted: true }, reviewedByUserId: '9fca1e1a-5c09-4e1d-a8a3-6b17e03dd183', reviewNote: 'Đã xác minh đầy đủ giấy tờ tùy thân.',
    submittedAt: '2026-10-23T09:15:00.000Z', reviewedAt: '2026-10-23T10:30:00.000Z', createdAt: '2026-10-23T09:15:00.000Z', updatedAt: '2026-10-23T10:30:00.000Z',
    workerProfile: { id: 'e9e7a4ce-76f3-43ac-a9a8-6504e721cc41', userId: 'bd7c49bc-b2fb-4c1c-a1e8-f7c37ad2095a', status: 'ACTIVE', averageRating: '4.96', ratingCount: 92, completedOrderCount: 110, orderCountTotal: 118, verifiedAt: '2026-10-23T10:30:00.000Z', approvedAt: '2026-10-23T10:30:00.000Z', createdAt: '2026-10-18T11:00:00.000Z', updatedAt: '2026-10-23T10:30:00.000Z', user: { id: 'bd7c49bc-b2fb-4c1c-a1e8-f7c37ad2095a', fullName: 'Lê Văn Nam', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80', status: 'ACTIVE', createdAt: '2026-10-18T11:00:00.000Z', updatedAt: '2026-10-23T10:30:00.000Z' } }, jobs: [], reviewHistories: [], reviewer: { id: '9fca1e1a-5c09-4e1d-a8a3-6b17e03dd183' },
  },
  {
    id: 'd409e512-1182-4aa8-9214-55091ff78201', workerProfileId: '1e087af4-a4e4-4f88-b520-9e17c3f98b7d', idDocumentType: 'CCCD', idNumberMasked: '0831******14',
    documentFrontRef: 'https://example.invalid/invalid-front.jpg', documentBackRef: null, selfieRef: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80',
    status: 'rejected', version: 1, idempotencyKey: null, activeJobId: null, aiSimilarityScore: 0.45, rawOcrData: { confidence: 0.45, readable: false }, aiResult: { recommendation: 'manual-review' }, reviewedByUserId: '9fca1e1a-5c09-4e1d-a8a3-6b17e03dd183', reviewNote: 'Ảnh CCCD mặt trước bị chói đèn flash mất số thẻ.',
    submittedAt: '2026-10-22T16:30:00.000Z', reviewedAt: '2026-10-22T17:10:00.000Z', createdAt: '2026-10-22T16:30:00.000Z', updatedAt: '2026-10-22T17:10:00.000Z',
    workerProfile: { id: '1e087af4-a4e4-4f88-b520-9e17c3f98b7d', userId: '6e11ec1d-9efa-4592-a30e-bb21b0ccca75', status: 'ACTIVE', averageRating: '4.70', ratingCount: 19, completedOrderCount: 15, orderCountTotal: 23, verifiedAt: null, approvedAt: null, createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-22T17:10:00.000Z', user: { id: '6e11ec1d-9efa-4592-a30e-bb21b0ccca75', fullName: 'Phạm Thu Trang', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&q=80', status: 'ACTIVE', createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-22T17:10:00.000Z' } }, jobs: [], reviewHistories: [], reviewer: { id: '9fca1e1a-5c09-4e1d-a8a3-6b17e03dd183' },
  },
  {
    id: 'e721a941-8842-491c-8012-33018aa44192', workerProfileId: '620cf4c5-8dc1-4ae2-b49e-e3e9b18a17d7', idDocumentType: null, idNumberMasked: null,
    documentFrontRef: null, documentBackRef: null, selfieRef: null,
    status: 'draft', version: 1, idempotencyKey: null, activeJobId: null, aiSimilarityScore: null, rawOcrData: null, aiResult: null, reviewedByUserId: null, reviewNote: null,
    submittedAt: null, reviewedAt: null, createdAt: '2026-10-22T11:05:00.000Z', updatedAt: '2026-10-22T11:05:00.000Z',
    workerProfile: { id: '620cf4c5-8dc1-4ae2-b49e-e3e9b18a17d7', userId: '3cc74cb5-2f4f-4dc5-8c5e-4ea93ffdc4d5', status: 'INACTIVE', averageRating: '4.80', ratingCount: 12, completedOrderCount: 8, orderCountTotal: 10, verifiedAt: null, approvedAt: null, createdAt: '2026-10-16T13:00:00.000Z', updatedAt: '2026-10-22T11:05:00.000Z', user: { id: '3cc74cb5-2f4f-4dc5-8c5e-4ea93ffdc4d5', fullName: 'Hoàng Quốc Bảo', avatarUrl: null, status: 'INACTIVE', createdAt: '2026-10-16T13:00:00.000Z', updatedAt: '2026-10-22T11:05:00.000Z' } }, jobs: [], reviewHistories: [], reviewer: null,
  },
];
