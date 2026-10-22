import { describe, it, expect } from 'vitest';
import { PushErrorClassifier } from './push-error-classifier.js';

describe('PushErrorClassifier', () => {
  it('identifies permanently invalid FCM registration tokens', () => {
    const invalidCodes = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/invalid-argument',
    ];

    for (const code of invalidCodes) {
      const res = PushErrorClassifier.classify(code, 'Token is dead');
      expect(res.shouldDeactivateToken).toBe(true);
      expect(res.isTransient).toBe(false);
    }

    const byMessage = PushErrorClassifier.classify(
      'some-error',
      'The registration token is not registered on the server',
    );
    expect(byMessage.shouldDeactivateToken).toBe(true);
    expect(byMessage.isTransient).toBe(false);
  });

  it('identifies transient retryable errors without deactivating token', () => {
    const transientCodes = [
      'messaging/unavailable',
      'messaging/internal-error',
      'messaging/server-unavailable',
      'messaging/quota-exceeded',
      'messaging/too-many-requests',
    ];

    for (const code of transientCodes) {
      const res = PushErrorClassifier.classify(code, 'Service temporarily down');
      expect(res.isTransient).toBe(true);
      expect(res.shouldDeactivateToken).toBe(false);
    }

    const netErr = PushErrorClassifier.classify(undefined, 'connect ETIMEDOUT 142.250.190.42');
    expect(netErr.isTransient).toBe(true);
    expect(netErr.shouldDeactivateToken).toBe(false);
  });

  it('treats unknown/config errors as terminal failures without deactivating token', () => {
    const res = PushErrorClassifier.classify(
      'messaging/mismatched-credential',
      'Credential does not match project',
    );
    expect(res.isTransient).toBe(false);
    expect(res.shouldDeactivateToken).toBe(false);
  });

  it('sanitizes and bounds error messages to 500 characters', () => {
    const hugeMsg = 'A'.repeat(600);
    const res = PushErrorClassifier.classify('messaging/unknown', hugeMsg);
    expect(res.sanitizedMessage.length).toBeLessThanOrEqual(500);
    expect(res.sanitizedMessage.endsWith('...')).toBe(true);
  });
});
