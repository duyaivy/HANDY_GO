/**
 * Utility function to validate bid price according to PR62-05-P2 / RAD-02.
 * A valid bid price must be a finite number strictly greater than 0.
 *
 * @param price - raw bid price value (can be number, string, null, undefined, etc.)
 * @returns true if price is a valid positive finite number (> 0), false otherwise.
 */
export function isValidBidPrice(price?: unknown): price is number {
  if (price === null || price === undefined || price === '' || typeof price === 'boolean') {
    return false;
  }
  const num = typeof price === 'number' ? price : Number(price);
  return typeof num === 'number' && Number.isFinite(num) && num > 0;
}
