import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdminQueryDisputesDto,
  DisputePreviousStatus,
  DisputeSortBy,
  SortOrder,
} from './admin-query-disputes.dto.js';

describe('AdminQueryDisputesDto', () => {
  it('transforms pagination and applies queue defaults', async () => {
    const dto = plainToInstance(AdminQueryDisputesDto, {
      page: '2',
      limit: '25',
      previousStatus: DisputePreviousStatus.COMPLETED,
      sortBy: DisputeSortBy.COMPLETED_AT,
      sortOrder: SortOrder.ASC,
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(25);
    expect(new AdminQueryDisputesDto()).toMatchObject({
      page: 1,
      limit: 10,
      sortBy: DisputeSortBy.DISPUTED_AT,
      sortOrder: SortOrder.DESC,
    });
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ limit: '101' }, 'limit'],
    [{ previousStatus: 'cancelled' }, 'previousStatus'],
    [{ disputedFrom: 'not-a-date' }, 'disputedFrom'],
    [{ disputedTo: 'not-a-date' }, 'disputedTo'],
    [{ sortBy: 'customerUserId' }, 'sortBy'],
    [{ sortOrder: 'sideways' }, 'sortOrder'],
    [{ search: 123 }, 'search'],
  ])('rejects invalid query %j', async (input, property) => {
    const dto = plainToInstance(AdminQueryDisputesDto, input);

    expect((await validate(dto)).map((error) => error.property)).toContain(
      property,
    );
  });
});
