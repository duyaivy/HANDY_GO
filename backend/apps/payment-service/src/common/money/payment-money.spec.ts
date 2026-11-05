import { describe, expect, it } from 'vitest';
import { calculateAllocation, parseOrderAmount } from './payment-money.js';

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
    [1n, '49.99', 0n, 1n],
    [1n, '50.00', 1n, 0n],
    [9223372036854775807n, '100.00', 9223372036854775807n, 0n],
    [250n, '0', 0n, 250n],
  ])('allocates %s VND at %s percent', (amount, rate, fee, earning) => {
    expect(calculateAllocation(amount, rate)).toEqual({ platformFee: fee, workerEarning: earning });
  });

  it.each(['-1', '100.01', '1.001', '5e0', '', 'NaN'])(
    'rejects invalid commission rate %s',
    (rate) => expect(() => calculateAllocation(100n, rate)).toThrow(),
  );

  it.each([0n, -1n, 9223372036854775808n])('rejects amount outside BIGINT range', (amount) => {
    expect(() => calculateAllocation(amount, '5')).toThrow();
  });
});
