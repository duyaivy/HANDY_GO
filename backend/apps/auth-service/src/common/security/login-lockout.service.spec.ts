import { describe, expect, it, beforeEach } from 'vitest';
import { LoginLockoutService } from './login-lockout.service.js';
import { AppException } from '@app/common';

describe('LoginLockoutService', () => {
  let service: LoginLockoutService;

  beforeEach(() => {
    service = new LoginLockoutService();
  });

  it('should not throw if no failed logins recorded', async () => {
    await expect(service.checkFailedLogins('0912345678')).resolves.not.toThrow();
  });

  it('should lock out account after 5 failed attempts', async () => {
    const phone = '0912345678';
    for (let i = 0; i < 4; i++) {
      await service.recordFailedLogin(phone);
      await expect(service.checkFailedLogins(phone)).resolves.not.toThrow();
    }

    // 5th failed attempt triggers lockout
    await service.recordFailedLogin(phone);

    await expect(service.checkFailedLogins(phone)).rejects.toThrow(AppException);
  });

  it('should reset failed login attempts upon successful login', async () => {
    const phone = '0912345678';
    for (let i = 0; i < 5; i++) {
      await service.recordFailedLogin(phone);
    }

    await expect(service.checkFailedLogins(phone)).rejects.toThrow(AppException);

    await service.resetFailedLogins(phone);
    await expect(service.checkFailedLogins(phone)).resolves.not.toThrow();
  });
});
