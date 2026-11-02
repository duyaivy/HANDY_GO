import { PreferencesController } from './preferences.controller.js';
import type { PreferencesService } from './preferences.service.js';

describe('PreferencesController', () => {
  it('uses the trusted user identity and the standard response envelope', async () => {
    const userId = '873ee38a-3142-49fe-a191-d25b7de40d94';
    const data = { pushEnabled: true, inAppEnabled: true, emailEnabled: false };
    const service = { get: vi.fn().mockResolvedValue(data) };
    const controller = new PreferencesController(
      service as unknown as PreferencesService,
    );
    expect(await controller.get(userId)).toMatchObject({
      statusCode: 200,
      data,
    });
    expect(service.get).toHaveBeenCalledWith(userId);
  });
});
