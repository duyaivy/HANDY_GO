import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KycAdminController } from './kyc-admin.controller.js';

describe('KycAdminController', () => {
  let controller: KycAdminController;
  let serviceMock: any;

  beforeEach(() => {
    serviceMock = {
      listAdminKycCases: vi.fn().mockResolvedValue({
        statusCode: 200,
        data: [{ id: 'case-1' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
      getAdminKycCaseDetail: vi.fn().mockResolvedValue({
        statusCode: 200,
        data: { id: 'case-1', status: 'reviewing' },
      }),
      reviewKycCase: vi.fn().mockResolvedValue({
        statusCode: 200,
        message: 'Đã phê duyệt hồ sơ KYC thành công',
      }),
    };

    controller = new KycAdminController(serviceMock);
  });

  it('listKycCases delegates to service', async () => {
    const query = { status: 'reviewing', page: 1, limit: 20 };
    const res = await controller.listKycCases(query);
    expect(res).toEqual(expect.objectContaining({ statusCode: 200 }));
    expect(serviceMock.listAdminKycCases).toHaveBeenCalledWith(query);
  });

  it('getKycCaseDetail delegates to service with caseId', async () => {
    const res = await controller.getKycCaseDetail('case-1');
    expect(res).toEqual(expect.objectContaining({ statusCode: 200 }));
    expect(serviceMock.getAdminKycCaseDetail).toHaveBeenCalledWith('case-1');
  });

  it('reviewKycCase delegates adminUserId, caseId, and dto to service', async () => {
    const adminUser = { userId: 'admin-007' } as any;
    const dto = { decision: 'approved' as const, note: 'All matched' };

    const res = await controller.reviewKycCase(adminUser, 'case-1', dto);
    expect(res).toEqual(expect.objectContaining({ statusCode: 200 }));
    expect(serviceMock.reviewKycCase).toHaveBeenCalledWith('admin-007', 'case-1', dto);
  });
});
