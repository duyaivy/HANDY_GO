import { describe, expect, it } from 'vitest';
import { assertAttemptTransition, assertPaymentTransition, canTransitionPayment } from './payment-state.js';

describe('payment state machine', () => {
  it('allows the documented payment paths', () => {
    expect(canTransitionPayment('pending', 'processing')).toBe(true);
    expect(canTransitionPayment('processing', 'succeeded')).toBe(true);
    expect(canTransitionPayment('failed', 'processing')).toBe(true);
    expect(canTransitionPayment('succeeded', 'refunded')).toBe(true);
  });

  it('rejects regressions and terminal exits with 409', () => {
    expect(canTransitionPayment('succeeded', 'pending')).toBe(false);
    expect(canTransitionPayment('cancelled', 'pending')).toBe(false);
    expect(canTransitionPayment('refunded', 'succeeded')).toBe(false);
    expect(canTransitionPayment('succeeded', 'partially_refunded')).toBe(false);
    expect(() => assertPaymentTransition('succeeded', 'failed')).toThrowError(/cannot move/);
    expect(() => assertAttemptTransition('succeeded', 'failed')).toThrowError(/cannot move/);
    expect(() => assertAttemptTransition('processing', 'succeeded')).not.toThrow();
  });
});
