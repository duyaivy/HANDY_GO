import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CloudinaryService } from './cloudinary.service.js';
const owner = '11111111-1111-4111-8111-111111111111';
const config = {
  cloudinaryVideoMaxSizeMb: 100,
  cloudinaryImageMaxSizeMb: 10,
  cloudinaryCloudName: 'handygo',
  cloudinaryApiKey: 'key',
  cloudinaryApiSecret: 'secret',
  cloudinaryVideoFolder: 'videos',
  cloudinaryImageFolder: 'images',
  cloudinaryVideoChunkSizeMb: 20,
};
describe('review upload ownership', () => {
  it.each(['review', undefined, 'chat'] as const)(
    'keeps final provider public ID identical to returned ID for %s',
    async (intent) => {
      let signed: any;
      const service = new CloudinaryService(
        {
          utils: {
            api_sign_request: (params: any) => {
              signed = params;
              return 'signature';
            },
          },
        } as any,
        config as any,
      );
      const result = await service.createVideoUploadSignature(
        { fileName: 'clip.mp4', mimeType: 'video/mp4', fileSize: 100, intent },
        owner,
      );
      const finalPublicId = [signed.folder, signed.public_id]
        .filter(Boolean)
        .join('/');
      expect(finalPublicId).toBe(result.publicId);
      if (intent !== 'chat')
        expect(result.uploadReceipt).toBe(
          crypto
            .createHmac('sha256', 'secret')
            .update(`${owner}:video:${finalPublicId}`)
            .digest('hex'),
        );
    },
  );
  it('issues receipt for completed public image upload and rejects other owners or assets', async () => {
    const sdk = {
      uploader: {
        upload_stream: (_options: any, callback: any) =>
          new Writable({
            write(_chunk, _encoding, done) {
              done();
            },
            final(done) {
              callback(undefined, {
                public_id: 'images/generated-id',
                secure_url:
                  'https://res.cloudinary.com/handygo/image/upload/images/generated-id.jpg',
                resource_type: 'image',
              });
              done();
            },
          }),
      },
    };
    const service = new CloudinaryService(sdk as any, config as any);
    const buffer = Buffer.from('ffd8ff00', 'hex');
    const uploaded = await service.uploadImage(
      { buffer, size: buffer.length, mimetype: 'image/jpeg' } as any,
      undefined,
      owner,
    );
    expect(uploaded.uploadReceipt).toBeTruthy();
    const input = {
      publicId: uploaded.publicId,
      ownerId: owner,
      mediaType: 'image' as const,
      uploadReceipt: uploaded.uploadReceipt,
    };
    expect(await service.verifyReviewMedia(input)).toBe(true);
    expect(
      await service.verifyReviewMedia({ ...input, ownerId: 'other' }),
    ).toBe(false);
    expect(
      await service.verifyReviewMedia({ ...input, publicId: 'images/other' }),
    ).toBe(false);
  });
  it('does not accept an image receipt for a video with the same public ID', async () => {
    const receipt = crypto.createHmac('sha256', 'secret').update(`${owner}:image:images/generated-id`).digest('hex');
    expect(await new CloudinaryService({} as any, config as any).verifyReviewMedia({ publicId: 'images/generated-id', ownerId: owner, mediaType: 'video', uploadReceipt: receipt })).toBe(false);
  });
  it('rejects owner-looking paths without receipts and fails closed without configured secret', async () => {
    const input = {
      publicId: `reviews/${owner}/photo`,
      ownerId: owner,
      mediaType: 'image' as const,
    };
    expect(
      await new CloudinaryService({} as any, config as any).verifyReviewMedia(
        input,
      ),
    ).toBe(false);
    expect(
      await new CloudinaryService(
        {} as any,
        { ...config, cloudinaryApiSecret: undefined } as any,
      ).verifyReviewMedia({ ...input, uploadReceipt: 'forged' }),
    ).toBe(false);
  });
});
