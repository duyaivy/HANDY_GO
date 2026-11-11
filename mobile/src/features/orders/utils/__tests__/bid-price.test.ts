import { isValidBidPrice } from '../bid-price';

describe('isValidBidPrice (PR62-05-P2 / RAD-02)', () => {
  it('returns true for positive numbers', () => {
    expect(isValidBidPrice(1)).toBe(true);
    expect(isValidBidPrice(150000)).toBe(true);
    expect(isValidBidPrice(250000.5)).toBe(true);
    expect(isValidBidPrice('200000')).toBe(true);
    expect(isValidBidPrice('150000.5')).toBe(true);
  });

  it('returns false for zero, negative numbers, and non-positive strings', () => {
    expect(isValidBidPrice(0)).toBe(false);
    expect(isValidBidPrice(-1)).toBe(false);
    expect(isValidBidPrice(-50000)).toBe(false);
    expect(isValidBidPrice('0')).toBe(false);
    expect(isValidBidPrice('-100')).toBe(false);
  });

  it('returns false for null, undefined, empty string, and booleans', () => {
    expect(isValidBidPrice(null)).toBe(false);
    expect(isValidBidPrice(undefined)).toBe(false);
    expect(isValidBidPrice('')).toBe(false);
    expect(isValidBidPrice('   ')).toBe(false);
    expect(isValidBidPrice(true)).toBe(false);
    expect(isValidBidPrice(false)).toBe(false);
  });

  it('returns false for NaN, Infinity, and non-numeric strings or objects', () => {
    expect(isValidBidPrice(Number.NaN)).toBe(false);
    expect(isValidBidPrice(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidBidPrice(Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isValidBidPrice('abc')).toBe(false);
    expect(isValidBidPrice({})).toBe(false);
    expect(isValidBidPrice([])).toBe(false);
  });
});
