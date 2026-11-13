import { describe, expect, it, vi } from 'vitest';
import { TopupIpnController } from './topups.controller.js';

describe('VNPAY browser return', () => {
  it('never interprets a browser redirect as a committed credit', () => {
    const handleIpn = vi.fn();
    const controller = new TopupIpnController({ handleIpn } as never);
    expect(controller.browserReturn()).toMatchObject({
      data: { confirmed: false, authenticationRequired: true },
    });
    expect(handleIpn).not.toHaveBeenCalled();
  });
});
