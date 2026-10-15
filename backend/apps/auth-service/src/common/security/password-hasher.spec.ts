import { describe, expect, it } from 'vitest';
import { BcryptPasswordHasher } from './password-hasher.js';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('hashes password and verifies correctly', async () => {
    const rawPassword = 'SecurePassword@2026';
    const hash = await hasher.hash(rawPassword);

    expect(hash).toMatch(/^\$2[aby]\$\d+\$/);
    expect(hash).not.toBe(rawPassword);

    const isMatch = await hasher.compare(rawPassword, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await hasher.compare('WrongPassword@2026', hash);
    expect(isWrongMatch).toBe(false);
  });
});
