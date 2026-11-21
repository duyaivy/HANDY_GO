import {
  formatPointsToVND,
  getTransactionSign,
  parsePointsToNumber,
} from '../formatters';

describe('wallet money formatters', () => {
  it.each([null, undefined, '', '0', 0])('formats empty and zero values (%s)', (value) => {
    expect(formatPointsToVND(value)).toBe('0 đ');
    expect(parsePointsToNumber(value)).toBe(0);
  });

  it('groups whole VND without floating-point conversion', () => {
    expect(formatPointsToVND('50000')).toBe('50.000 đ');
    expect(formatPointsToVND('9007199254740993')).toBe('9.007.199.254.740.993 đ');
    expect(formatPointsToVND('-1234567')).toBe('-1.234.567 đ');
  });

  it('rejects values that cannot be represented safely as a number', () => {
    expect(parsePointsToNumber('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => parsePointsToNumber('9007199254740992')).toThrow(RangeError);
    expect(() => parsePointsToNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => formatPointsToVND('1.5')).toThrow(TypeError);
  });

  it('uses ledger type where direction is unambiguous', () => {
    expect(getTransactionSign('topup')).toBe('+');
    expect(getTransactionSign('refund_credit')).toBe('+');
    expect(getTransactionSign('adjustment_recovery')).toBe('+');
    expect(getTransactionSign('payment_debit')).toBe('-');
    expect(getTransactionSign('withdrawal')).toBe('-');
    expect(getTransactionSign('adjustment_funding')).toBe('-');
  });

  it('requires a direction for an admin adjustment', () => {
    expect(() => getTransactionSign('admin_adjustment')).toThrow();
    expect(getTransactionSign('admin_adjustment', 'credit')).toBe('+');
    expect(getTransactionSign('admin_adjustment', 'debit')).toBe('-');
  });
});
