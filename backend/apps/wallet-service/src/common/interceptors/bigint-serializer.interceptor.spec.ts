import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BigIntSerializerInterceptor } from './bigint-serializer.interceptor.js';

describe('BigIntSerializerInterceptor (F10)', () => {
  it('serializes nested BigInt to strings', async () => {
    const out = await lastValueFrom(
      new BigIntSerializerInterceptor().intercept({} as never, {
        handle: () => of({ amount: 10n, items: [{ fee: 2n }] }),
      }),
    );
    expect(out).toEqual({ amount: '10', items: [{ fee: '2' }] });
  });
});
