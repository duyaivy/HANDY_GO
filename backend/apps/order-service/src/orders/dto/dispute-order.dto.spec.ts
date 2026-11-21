import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { DisputeCategory, DisputeOrderDto } from './dispute-order.dto.js';

describe('DisputeOrderDto', () => {
  it('accepts a reason, category and valid evidence URLs', async () => {
    const dto = Object.assign(new DisputeOrderDto(), {
      reason: 'Dịch vụ chưa hoàn thành đúng cam kết',
      category: DisputeCategory.INCOMPLETE_WORK,
      evidenceUrls: [
        'https://example.com/photo.jpg',
        'https://example.com/video.mp4',
      ],
    });

    expect(await validate(dto)).toEqual([]);
  });

  it.each([
    [{ reason: 'Lỗi' }, 'reason'],
    [{ reason: 'Dịch vụ bị lỗi', category: 'unknown' }, 'category'],
    [{ reason: 'Dịch vụ bị lỗi', evidenceUrls: ['invalid'] }, 'evidenceUrls'],
    [{ reason: 'Dịch vụ bị lỗi', evidenceUrls: 'https://example.com/a.jpg' }, 'evidenceUrls'],
  ])('rejects invalid input %j', async (input, property) => {
    const dto = Object.assign(new DisputeOrderDto(), input);

    expect((await validate(dto)).map((error) => error.property)).toContain(
      property,
    );
  });
});
