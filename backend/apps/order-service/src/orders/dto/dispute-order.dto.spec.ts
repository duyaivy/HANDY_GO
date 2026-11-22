import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { DisputeCategory, DisputeOrderDto } from './dispute-order.dto.js';
import { ResolveDisputeDto } from './resolve-dispute.dto.js';

describe('DisputeOrderDto', () => {
  it('accepts a reason, category and valid evidence URLs', async () => {
    const dto = Object.assign(new DisputeOrderDto(), {
      reason: 'Dịch vụ chưa hoàn thành đúng cam kết',
      category: DisputeCategory.INCOMPLETE_WORK,
      evidenceUrls: [
        'https://storage.handygo.vn/a.jpg',
        'https://example.com/photo.jpg',
        'https://example.com/video.mp4',
      ],
    });

    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    [{ reason: 'Lỗi' }, 'reason'],
    [{ reason: 'x'.repeat(2001) }, 'reason'],
    [{ reason: 'Dịch vụ bị lỗi', category: 'unknown' }, 'category'],
    [{ reason: 'Dịch vụ bị lỗi', evidenceUrls: ['invalid'] }, 'evidenceUrls'],
    [{ reason: 'Dịch vụ bị lỗi', evidenceUrls: ['ftp://evil.com/a.jpg'] }, 'evidenceUrls'],
    [{ reason: 'Dịch vụ bị lỗi', evidenceUrls: ['evil.com/a.jpg'] }, 'evidenceUrls'],
    [{ reason: 'Dịch vụ bị lỗi', evidenceUrls: ['javascript:alert(1)'] }, 'evidenceUrls'],
    [
      {
        reason: 'Dịch vụ bị lỗi',
        evidenceUrls: Array.from({ length: 11 }, (_, i) => `https://example.com/${i}.jpg`),
      },
      'evidenceUrls',
    ],
    [
      {
        reason: 'Dịch vụ bị lỗi',
        evidenceUrls: [`https://example.com/${'a'.repeat(2030)}.jpg`],
      },
      'evidenceUrls',
    ],
    [{ reason: 'Dịch vụ bị lỗi', evidenceUrls: 'https://example.com/a.jpg' }, 'evidenceUrls'],
  ])('rejects invalid input %j', async (input, property) => {
    const dto = Object.assign(new DisputeOrderDto(), input);

    expect((await validate(dto)).map((error) => error.property)).toContain(
      property,
    );
  });
});

describe('ResolveDisputeDto', () => {
  it('accepts valid resolutionNote and refundAmountVnd within 19 digits', async () => {
    const dto = Object.assign(new ResolveDisputeDto(), {
      action: 'refund',
      resolutionNote: 'Chấp nhận hoàn tiền theo bằng chứng khách cung cấp',
      refundAmountVnd: '50000',
      idempotencyKey: 'idem-key-1',
    });

    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    [{ action: 'dismiss', resolutionNote: 'x'.repeat(2001) }, 'resolutionNote'],
    [
      {
        action: 'refund',
        resolutionNote: 'Hoàn tiền hợp lệ',
        refundAmountVnd: '10000000000000000000',
      },
      'refundAmountVnd',
    ],
  ])('rejects invalid ResolveDisputeDto %j', async (input, property) => {
    const dto = Object.assign(new ResolveDisputeDto(), input);

    expect((await validate(dto)).map((error) => error.property)).toContain(
      property,
    );
  });
});
