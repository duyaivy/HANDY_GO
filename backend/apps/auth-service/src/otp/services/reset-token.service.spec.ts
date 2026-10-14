import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { ResetTokenService } from './reset-token.service.js';

describe('ResetTokenService', () => {
  const service = new ResetTokenService();

  it('generates random hex reset token and matching SHA-256 tokenHash', () => {
    const generated = service.generateResetToken(900);

    expect(generated.rawToken).toHaveLength(64); // 32 bytes hex
    expect(generated.lifetimeSeconds).toBe(900);
    expect(generated.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const expectedHash = crypto
      .createHash('sha256')
      .update(generated.rawToken)
      .digest('hex');

    expect(generated.tokenHash).toBe(expectedHash);
  });

  it('hashes token consistently via hashToken', () => {
    const raw = 'test-raw-token-123456';
    const hash1 = service.hashToken(raw);
    const hash2 = service.hashToken(raw);

    expect(hash1).toBe(hash2);
    expect(hash1).toBe(
      crypto.createHash('sha256').update(raw).digest('hex'),
    );
  });
});
