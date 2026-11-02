import { DevicesService } from './devices.service.js';
import type { DevicesRepository } from './devices.repository.js';

describe('DevicesService', () => {
  const repository = { register: vi.fn(), deactivate: vi.fn() };
  const service = new DevicesService(
    repository as unknown as DevicesRepository,
  );
  beforeEach(() => vi.resetAllMocks());

  it('passes registration identity from the authenticated context', async () => {
    const dto = {
      platform: 'ios' as const,
      pushToken: 'private-token',
      deviceId: 'installation',
    };
    repository.register.mockResolvedValue({ id: 'device', isActive: true });
    expect(await service.register('owner', dto)).toEqual({
      id: 'device',
      isActive: true,
    });
    expect(repository.register).toHaveBeenCalledWith('owner', dto);
  });

  it('returns the same inactive state for repeated owned deactivation', async () => {
    repository.deactivate.mockResolvedValue({ count: 1 });
    expect(await service.deactivate('owner', 'device')).toEqual(
      await service.deactivate('owner', 'device'),
    );
    expect(repository.deactivate).toHaveBeenCalledWith('owner', 'device');
  });

  it('hides missing and other-user devices with 404', async () => {
    repository.deactivate.mockResolvedValue({ count: 0 });
    await expect(service.deactivate('other', 'device')).rejects.toMatchObject({
      status: 404,
    });
  });
});
