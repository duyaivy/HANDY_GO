import { describe, expect, it } from 'vitest';
import { interpretWalletResult } from './wallet-outcome.js';

describe('interpretWalletResult', () => {
  it('treats only a completed operation as success', () => {
    expect(interpretWalletResult({ outcome: 'ok', status: 200, data: { status: 'completed' } })).toEqual({ kind: 'success' });
    expect(interpretWalletResult({ outcome: 'ok', status: 200, data: { status: 'pending' } })).toEqual({ kind: 'unknown' });
    expect(interpretWalletResult({ outcome: 'ok', status: 200, data: { status: 'reversed' } })).toEqual({ kind: 'unknown' });
    expect(interpretWalletResult({ outcome: 'ok', status: 200, data: { status: 'failed' } })).toMatchObject({ kind: 'failed' });
  });

  it('keeps every unproven HTTP refusal unresolved, including conflict and lookup 404', () => {
    for (const status of [400, 401, 403, 404, 408, 409, 422, 429]) {
      expect(interpretWalletResult({ outcome: 'rejected', status, message: 'x' })).toEqual({ kind: 'unknown' });
    }
  });

  it('keeps timeouts and missing operations unresolved', () => {
    expect(interpretWalletResult({ outcome: 'unknown', message: 'timeout' })).toEqual({ kind: 'unknown' });
    expect(interpretWalletResult({ outcome: 'missing' })).toEqual({ kind: 'unknown' });
  });
});
