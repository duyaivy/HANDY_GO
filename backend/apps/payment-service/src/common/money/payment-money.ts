const MAX_BIGINT = 9223372036854775807n;

function assertAmount(amount: bigint): void {
  if (amount <= 0n || amount > MAX_BIGINT) {
    throw new RangeError(
      'Amount must be positive and fit in a PostgreSQL BIGINT',
    );
  }
}

export function parseOrderAmount(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.0+)?$/.test(value)) {
    throw new RangeError('Order amount must be an exact whole number of VND');
  }
  const amount = BigInt(value.split('.')[0]);
  assertAmount(amount);
  return amount;
}

// PO policy: Admin may configure 0.00%–30.00% (inclusive); 100% is forbidden so a positive order
// always leaves the worker a positive earning.
export const MAX_COMMISSION_BASIS_POINTS = 3000n;
export const DEFAULT_COMMISSION_RATE_PERCENT = '10.00';

export function parseCommissionRate(ratePercent: string): {
  basisPoints: bigint;
  normalized: string;
} {
  const match = /^(0|[1-9]\d{0,2})(?:\.(\d{1,2}))?$/.exec(ratePercent);
  if (!match)
    throw new RangeError(
      'Commission rate must have at most two decimal places',
    );
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const basisPoints = BigInt(match[1]) * 100n + BigInt(fraction);
  if (basisPoints > MAX_COMMISSION_BASIS_POINTS) {
    throw new RangeError('Commission rate must be between 0 and 30 percent');
  }
  return { basisPoints, normalized: `${match[1]}.${fraction}` };
}

export function calculateAllocation(
  amount: bigint,
  ratePercent: string,
): {
  platformFee: bigint;
  workerEarning: bigint;
} {
  assertAmount(amount);
  const { basisPoints } = parseCommissionRate(ratePercent);
  const platformFee = (amount * basisPoints + 5000n) / 10000n;
  return { platformFee, workerEarning: amount - platformFee };
}
