import { describe, expect, it } from 'vitest';
import {
  calculateAllocation,
  parseCommissionRate,
  parseOrderAmount,
} from './payment-money.js';

describe('payment money', () => {
  it.each([
    ['350000', 350000n],
    ['350000.00', 350000n],
    ['1.0000', 1n],
    ['9223372036854775807', 9223372036854775807n],
  ])('parses exact whole VND %s', (input, expected) => {
    expect(parseOrderAmount(input)).toBe(expected);
  });

  it.each(['0', '-1', '1.01', '1e3', '.00', '01', '9223372036854775808', ''])(
    'rejects invalid or non-integral amount %s',
    (input) => expect(() => parseOrderAmount(input)).toThrow(),
  );

  it.each([
    [100n, '5.00', 5n, 95n],
    [10n, '5', 1n, 9n],
    [1n, '29.99', 0n, 1n],
    [500000n, '10.00', 50000n, 450000n],
    [1n, '30.00', 0n, 1n],
    [9223372036854775807n, '30.00', 2767011611056432742n, 6456360425798343065n],
    [250n, '0', 0n, 250n],
  ])('allocates %s VND at %s percent', (amount, rate, fee, earning) => {
    expect(calculateAllocation(amount, rate)).toEqual({
      platformFee: fee,
      workerEarning: earning,
    });
  });

  it('always leaves the worker a positive earning under the policy cap', () => {
    for (const amount of [1n, 2n, 3n, 7n, 999n]) {
      expect(
        calculateAllocation(amount, '30.00').workerEarning,
      ).toBeGreaterThan(0n);
    }
  });

  it.each([
    '-1',
    '30.01',
    '31',
    '50.00',
    '100.00',
    '100.01',
    '1.001',
    '5e0',
    '',
    'NaN',
  ])('rejects invalid commission rate %s', (rate) =>
    expect(() => calculateAllocation(100n, rate)).toThrow(),
  );

  it('normalizes accepted commission rates', () => {
    expect(parseCommissionRate('10')).toEqual({
      basisPoints: 1000n,
      normalized: '10.00',
    });
    expect(parseCommissionRate('0.5')).toEqual({
      basisPoints: 50n,
      normalized: '0.50',
    });
    expect(parseCommissionRate('30')).toEqual({
      basisPoints: 3000n,
      normalized: '30.00',
    });
  });

  it.each([0n, -1n, 9223372036854775808n])(
    'rejects amount outside BIGINT range',
    (amount) => {
      expect(() => calculateAllocation(amount, '5')).toThrow();
    },
  );
});
