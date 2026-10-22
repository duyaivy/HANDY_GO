import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KycController } from './kyc.controller.js';

describe('KycController', () => {
  let controller: KycController;
  let serviceMock: any;
  let workerMock: any;

  beforeEach(() => {
    serviceMock = {
      submitKyc: vi.fn().mockResolvedValue({ statusCode: 202, data: { jobId: 'job-1' } }),
      getMyKycStatus: vi.fn().mockResolvedValue({ statusCode: 200, data: { workerStatus: 'draft' } }),
      getKycJobStatus: vi.fn().mockResolvedValue({ statusCode: 200, data: { status: 'processing' } }),
    };

    workerMock = {
      processKycJob: vi.fn().mockResolvedValue(undefined),
    };

    controller = new KycController(serviceMock, workerMock);
  });

  it('submitMyKyc forwards dto, userId, and idempotency key to service', async () => {
    const user = { userId: 'user-1' } as any;
    const dto = {
      idDocumentType: 'CCCD',
      documentFrontRef: 'https://example.com/front.jpg',
      selfieRef: 'https://example.com/selfie.jpg',
    };

    const res = await controller.submitMyKyc(user, dto, 'key-header-1');
    expect(res).toEqual({ statusCode: 202, data: { jobId: 'job-1' } });
    expect(serviceMock.submitKyc).toHaveBeenCalledWith('user-1', dto, 'key-header-1');
  });

  it('getMyKycStatus calls service with user.userId', async () => {
    const user = { userId: 'user-1' } as any;
    const res = await controller.getMyKycStatus(user);
    expect(res).toEqual({ statusCode: 200, data: { workerStatus: 'draft' } });
    expect(serviceMock.getMyKycStatus).toHaveBeenCalledWith('user-1');
  });

  it('getKycJobStatus calls service with user.userId and jobId', async () => {
    const user = { userId: 'user-1' } as any;
    const res = await controller.getKycJobStatus(user, 'job-123');
    expect(res).toEqual({ statusCode: 200, data: { status: 'processing' } });
    expect(serviceMock.getKycJobStatus).toHaveBeenCalledWith('user-1', 'job-123');
  });

  it('handleKycJobProcess delegates to workerService', async () => {
    const event = { jobId: 'job-1' } as any;
    const context = { getChannelRef: vi.fn() } as any;

    await controller.handleKycJobProcess(event, context);
    expect(workerMock.processKycJob).toHaveBeenCalledWith(event, context);
  });

  it('uploads multipart files via CloudinaryService if files are attached', async () => {
    const cloudinaryMock = {
      uploadImage: vi.fn().mockImplementation((file: any) =>
        Promise.resolve({ url: `https://cloudinary.test/${file.originalname}` }),
      ),
    } as any;
    const controllerWithCloudinary = new KycController(
      serviceMock,
      workerMock,
      cloudinaryMock,
    );

    const user = { userId: 'user-1' } as any;
    const dto: any = { idDocumentType: 'CCCD' };
    const files = {
      documentFront: [{ originalname: 'front.jpg', buffer: Buffer.from('front') }],
      selfie: [{ originalname: 'selfie.jpg', buffer: Buffer.from('selfie') }],
    } as any;

    const _res = await controllerWithCloudinary.submitMyKyc(
      user,
      dto,
      undefined,
      undefined,
      files,
    );

    expect(cloudinaryMock.uploadImage).toHaveBeenCalledTimes(2);
    expect(dto.documentFrontRef).toBe('https://cloudinary.test/front.jpg');
    expect(dto.selfieRef).toBe('https://cloudinary.test/selfie.jpg');
    expect(serviceMock.submitKyc).toHaveBeenCalledWith('user-1', dto, undefined);
  });

  it('throws BadRequestException if neither file nor URL ref is provided', async () => {
    const user = { userId: 'user-1' } as any;
    const dto: any = { idDocumentType: 'CCCD' };

    await expect(controller.submitMyKyc(user, dto)).rejects.toThrow();
  });
});
