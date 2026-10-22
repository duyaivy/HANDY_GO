import { NotificationsController } from './notifications.controller.js';
import type { NotificationsService } from './notifications.service.js';

describe('NotificationsController', () => {
  it('uses the trusted user identity and the standard response envelope', async () => {
    const userId = '873ee38a-3142-49fe-a191-d25b7de40d94';
    const data = { count: 2 };
    const service = { unreadCount: vi.fn().mockResolvedValue(data) };
    const controller = new NotificationsController(
      service as unknown as NotificationsService,
    );
    expect(await controller.unreadCount(userId)).toMatchObject({
      statusCode: 200,
      data,
    });
    expect(service.unreadCount).toHaveBeenCalledWith(userId);
  });

  it('delegates broadcast to service and returns 201 envelope', async () => {
    const adminId = '873ee38a-3142-49fe-a191-d25b7de40d94';
    const broadcastResult = {
      broadcastId: 'bc-123',
      targetCount: 10,
      inAppCount: 9,
      pushJobCount: 0,
      skippedCount: 1,
    };
    const service = { broadcast: vi.fn().mockResolvedValue(broadcastResult) };
    const controller = new NotificationsController(
      service as unknown as NotificationsService,
    );

    const dto = {
      title: 'Thông báo',
      body: 'Nội dung',
    };

    const result = await controller.broadcast(adminId, dto as any);
    expect(result).toMatchObject({
      statusCode: 201,
      message: 'Phát thông báo thành công',
      data: broadcastResult,
    });
    expect(service.broadcast).toHaveBeenCalledWith(adminId, dto);
  });
});
