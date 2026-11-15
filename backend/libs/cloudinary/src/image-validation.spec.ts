import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CloudinaryService } from './cloudinary.service.js';

describe('image content validation before provider upload', () => {
  const create = () => {
    const sdk: any = {
      uploader: {
        upload_stream: vi.fn(
          (_options, done) =>
            new Writable({
              write(_chunk, _encoding, next) {
                next();
              },
              final(next) {
                done(undefined, { asset_id: 'asset' });
                next();
              },
            }),
        ),
      },
    };
    const service = new CloudinaryService(sdk, {
      cloudinaryImageMaxSizeMb: 10,
      cloudinaryCloudName: 'cloud',
      cloudinaryApiKey: 'key',
      cloudinaryApiSecret: 'secret',
    } as any);
    return { sdk, service };
  };
  it.each([
    ['image/png', Buffer.from('<script>malicious</script>').toString('hex')],
    ['image/jpeg', '89504e470d0a1a0a'],
    ['image/webp', '52494646000000004e4f5045'],
    ['image/png', '89'],
  ])('rejects forged or mismatched %s content', async (mimetype, content) => {
    const { sdk, service } = create();
    const buffer = Buffer.from(content, 'hex');
    await expect(
      service.uploadImage({ buffer, size: buffer.length, mimetype } as any),
    ).rejects.toThrow();
    expect(sdk.uploader.upload_stream).not.toHaveBeenCalled();
  });
  it.each([
    ['image/png', '89504e470d0a1a0a'],
    ['image/jpeg', 'ffd8ffe000'],
    ['image/webp', '524946460000000057454250'],
  ])(
    'accepts a matching %s signature for provider decoding',
    async (mimetype, content) => {
      const { sdk, service } = create();
      const buffer = Buffer.from(content, 'hex');
      await expect(
        service.uploadImage({ buffer, size: buffer.length, mimetype } as any),
      ).resolves.toMatchObject({ assetId: 'asset' });
      expect(sdk.uploader.upload_stream).toHaveBeenCalledOnce();
    },
  );
});
