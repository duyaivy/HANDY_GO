const MAX_BIGINT = 9223372036854775807n;

function assertAmount(amount: bigint): void {
  if (amount <= 0n || amount > MAX_BIGINT) {
    throw new RangeError('Amount must be positive and fit in a PostgreSQL BIGINT');
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

export function calculateAllocation(amount: bigint, ratePercent: string): {
  platformFee: bigint;
  workerEarning: bigint;
} {
  assertAmount(amount);
  const match = /^(0|[1-9]\d{0,2})(?:\.(\d{1,2}))?$/.exec(ratePercent);
  if (!match) throw new RangeError('Commission rate must have at most two decimal places');
  const basisPoints = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (basisPoints > 10000n) throw new RangeError('Commission rate must be between 0 and 100 percent');
  const platformFee = (amount * basisPoints + 5000n) / 10000n;
  return { platformFee, workerEarning: amount - platformFee };
}
