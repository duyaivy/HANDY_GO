import 'reflect-metadata';
import { request as httpRequest } from 'node:http';
import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import request from 'supertest';
import { ConfigService } from '@app/config';
import { CloudinaryService } from '@app/cloudinary';
import { UploadsController } from './uploads.controller.js';

describe('image multipart admission', () => {
  let app: INestApplication;
  const media = { uploadImage: vi.fn(async () => ({ assetId: 'uploaded' })) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        { provide: CloudinaryService, useValue: media },
        {
          provide: ConfigService,
          useValue: { cloudinaryImageMaxSizeMb: 1 / 1024 },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: unknown, next: () => void) => {
      req.user = { userId: '11111111-1111-4111-8111-111111111111' };
      next();
    });
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => media.uploadImage.mockClear());
  afterAll(async () => app?.close());
  it('rejects oversized multipart data before invoking the upload handler', async () => {
    const response = await request(app.getHttpServer())
      .post('/uploads/image')
      .attach('file', Buffer.alloc(1025), {
        filename: 'large.png',
        contentType: 'image/png',
      });
    expect(response.status).toBe(413);
    expect(media.uploadImage).not.toHaveBeenCalled();
  });
  it('rejects unsupported MIME types and multiple files before provider upload', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .post('/uploads/image')
          .attach('file', Buffer.from('<svg/>'), {
            filename: 'image.svg',
            contentType: 'image/svg+xml',
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .post('/uploads/image')
          .attach('file', Buffer.alloc(20), {
            filename: 'a.png',
            contentType: 'image/png',
          })
          .attach('file', Buffer.alloc(20), {
            filename: 'b.png',
            contentType: 'image/png',
          })
      ).status,
    ).toBe(400);
    expect(media.uploadImage).not.toHaveBeenCalled();
  });
  it('accepts an image within the configured limit', async () => {
    const response = await request(app.getHttpServer())
      .post('/uploads/image')
      .attach('file', Buffer.from('89504e470d0a1a0a', 'hex'), {
        filename: 'small.png',
        contentType: 'image/png',
      });
    expect(response.status).toBe(200);
    expect(media.uploadImage).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'accepts chat uploads with intent first=%s',
    async (intentFirst) => {
      const upload = request(app.getHttpServer()).post('/uploads/image');
      if (intentFirst) upload.field('intent', 'chat');
      upload.attach('file', Buffer.from('89504e470d0a1a0a', 'hex'), {
        filename: 'small.png',
        contentType: 'image/png',
      });
      if (!intentFirst) upload.field('intent', 'chat');
      expect((await upload).status).toBe(200);
      expect(media.uploadImage).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: 'image/png' }),
        '11111111-1111-4111-8111-111111111111',
      );
    },
  );
  it('does not invoke the handler for an interrupted multipart upload', async () => {
    const boundary = 'pr68-interrupted';
    const client = httpRequest(`${await app.getUrl()}/uploads/image`, {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    });
    client.on('error', () => {}); // Intentional client abort.
    const aborted = new Promise<void>((resolve) => {
      app
        .getHttpServer()
        .once('request', (incoming: import('node:http').IncomingMessage) => {
          incoming.once('aborted', resolve);
          incoming.once('data', () => client.destroy());
        });
    });
    client.write(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="partial.png"\r\nContent-Type: image/png\r\n\r\npartial`,
    );
    await aborted;
    expect(media.uploadImage).not.toHaveBeenCalled();
    // A later request still succeeds; no filesystem temporary files are used.
    expect(
      (
        await request(app.getHttpServer())
          .post('/uploads/image')
          .attach('file', Buffer.from('89504e470d0a1a0a', 'hex'), {
            filename: 'small.png',
            contentType: 'image/png',
          })
      ).status,
    ).toBe(200);
  });
});
