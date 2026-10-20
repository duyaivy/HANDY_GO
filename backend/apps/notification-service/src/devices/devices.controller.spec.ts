import { DevicesController } from './devices.controller.js';
import type { DevicesService } from './devices.service.js';

describe('DevicesController', () => {
  it('uses the trusted user identity and the standard response envelope', async () => {
    const userId = '873ee38a-3142-49fe-a191-d25b7de40d94';
    const data = { id: 'device' };
    const service = { register: vi.fn().mockResolvedValue(data) };
    const controller = new DevicesController(
      service as unknown as DevicesService,
    );
    expect(
      await controller.register(userId, {
        platform: 'android',
        pushToken: 'opaque',
      }),
    ).toMatchObject({ statusCode: 200, data });
    expect(service.register).toHaveBeenCalledWith(userId, {
      platform: 'android',
      pushToken: 'opaque',
    });
  });
});
