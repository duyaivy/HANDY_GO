import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CloudinaryService } from './cloudinary.service.js';
const owner = '11111111-1111-4111-8111-111111111111';
const base = {
  public_id: 'chat/private',
  resource_type: 'image',
  type: 'authenticated',
  format: 'jpg',
  bytes: 100,
  width: 20,
  height: 30,
  context: {
    custom: {
      chat_owner: owner,
      chat_intent: 'chat',
      chat_proof: crypto
        .createHmac('sha256', 'secret')
        .update(`${owner}:image:chat/private`)
        .digest('hex'),
    },
  },
};
function setup(asset: any, limits: Record<string, unknown> = {}) {
  const sdk: any = {
    api: { resource: vi.fn().mockResolvedValue(asset) },
    utils: {
      private_download_url: vi
        .fn()
        .mockReturnValue('https://provider.example/signed'),
    },
  };
  return new CloudinaryService(sdk, {
    cloudinaryApiSecret: 'secret',
    cloudinaryImageMaxSizeMb: 10,
    cloudinaryVideoMaxSizeMb: 2048,
    ...limits,
  } as any);
}
describe('private chat media', () => {
  it('verifies actual provider ownership and returns expiring delivery', async () => {
    const result = await setup(base).verifyChatMedia({
      storageKey: 'chat/private',
      ownerId: owner,
      mediaType: 'IMAGE',
    });
    expect(result).toMatchObject({
      ownerId: owner,
      verified: true,
      private: true,
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      width: 20,
      height: 30,
    });
    expect(Date.parse(result.urlExpiresAt) - Date.now()).toBeLessThanOrEqual(
      300000,
    );
  });
  it.each([
    { ...base, type: 'upload' },
    {
      ...base,
      context: {
        custom: {
          chat_owner: owner,
          chat_intent: 'chat',
          chat_proof: 'forged',
        },
      },
    },
    {
      ...base,
      context: { custom: { chat_owner: 'other', chat_intent: 'chat' } },
    },
    { ...base, bytes: 11 * 1024 * 1024 },
    { ...base, format: 'svg' },
  ])('rejects untrusted provider metadata', async (asset) => {
    await expect(
      setup(asset).verifyChatMedia({
        storageKey: 'chat/private',
        ownerId: owner,
        mediaType: 'IMAGE',
      }),
    ).rejects.toThrow();
  });
  it('signs owner context, authenticated delivery and overwrite prevention for video', async () => {
    const sdk: any = {
      utils: { api_sign_request: vi.fn().mockReturnValue('signed') },
    };
    const config: any = {
      cloudinaryVideoMaxSizeMb: 2048,
      cloudinaryCloudName: 'cloud',
      cloudinaryApiKey: 'key',
      cloudinaryApiSecret: 'secret',
      cloudinaryVideoFolder: 'videos',
      cloudinaryVideoChunkSizeMb: 20,
    };
    const result = await new CloudinaryService(
      sdk,
      config,
    ).createVideoUploadSignature(
      {
        fileName: 'v.mp4',
        fileSize: 100,
        mimeType: 'video/mp4',
        intent: 'chat',
      } as any,
      owner,
    );
    expect(sdk.utils.api_sign_request.mock.calls[0][0]).toMatchObject({
      type: 'authenticated',
      overwrite: false,
    });
    expect(result.context).toContain(
      `chat_owner=${owner}|chat_intent=chat|chat_proof=`,
    );
    expect(result).toMatchObject({ type: 'authenticated', overwrite: false });
  });
  it.each(['IMAGE', 'VIDEO'] as const)(
    'rejects actual provider bytes above lower configured %s cap despite small declared upload',
    async (mediaType) => {
      const resourceType = mediaType === 'IMAGE' ? 'image' : 'video';
      const asset = {
        ...base,
        resource_type: resourceType,
        format: mediaType === 'IMAGE' ? 'jpg' : 'mp4',
        bytes: mediaType === 'IMAGE' ? 6 * 1024 * 1024 : 75 * 1024 * 1024,
        context: {
          custom: {
            chat_owner: owner,
            chat_intent: 'chat',
            chat_proof: crypto
              .createHmac('sha256', 'secret')
              .update(`${owner}:${resourceType}:chat/private`)
              .digest('hex'),
          },
        },
      };
      await expect(
        setup(asset, {
          cloudinaryImageMaxSizeMb: 5,
          cloudinaryVideoMaxSizeMb: 50,
        }).verifyChatMedia({
          storageKey: 'chat/private',
          ownerId: owner,
          mediaType,
        }),
      ).rejects.toThrow();
    },
  );
  it.each([0, -1, NaN, Infinity, undefined])(
    'fails closed for invalid configured image cap %s',
    async (cap) => {
      await expect(
        setup(base, { cloudinaryImageMaxSizeMb: cap }).verifyChatMedia({
          storageKey: 'chat/private',
          ownerId: owner,
          mediaType: 'IMAGE',
        }),
      ).rejects.toThrow();
    },
  );

  it('does not trust small video-init declared bytes over actual completed provider bytes', async () => {
    let uploaded: Record<string, unknown>;
    const sdk: any = {
      api: { resource: vi.fn(async () => uploaded) },
      utils: {
        api_sign_request: vi.fn(() => 'signed'),
        private_download_url: vi.fn(() => 'https://provider.example/signed'),
      },
    };
    const config: any = {
      cloudinaryApiSecret: 'secret',
      cloudinaryApiKey: 'key',
      cloudinaryCloudName: 'cloud',
      cloudinaryVideoMaxSizeMb: 50,
      cloudinaryVideoChunkSizeMb: 20,
    };
    const service = new CloudinaryService(sdk, config);
    const init = await service.createVideoUploadSignature(
      {
        fileName: 'small.mp4',
        fileSize: 1024 * 1024,
        mimeType: 'video/mp4',
        intent: 'chat',
      },
      owner,
    );
    const custom = Object.fromEntries(
      init.context!.split('|').map((part) => part.split('=')),
    );
    uploaded = {
      public_id: init.publicId,
      resource_type: 'video',
      type: 'authenticated',
      format: 'mp4',
      bytes: 75 * 1024 * 1024,
      context: { custom },
    };
    await expect(
      service.verifyChatMedia({
        storageKey: init.publicId,
        ownerId: owner,
        mediaType: 'VIDEO',
      }),
    ).rejects.toThrow();
  });
});
