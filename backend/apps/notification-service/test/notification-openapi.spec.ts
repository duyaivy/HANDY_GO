import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DevicesController } from '../src/devices/devices.controller.js';
import { DevicesService } from '../src/devices/devices.service.js';
import { NotificationsController } from '../src/notifications/notifications.controller.js';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import { PreferencesController } from '../src/preferences/preferences.controller.js';
import { PreferencesService } from '../src/preferences/preferences.service.js';
import { TrustedGatewayGuard } from '../src/common/trusted-gateway.guard.js';

describe('Notification public OpenAPI contract', () => {
  it('requires Bearer auth without exposing internal identity headers on any operation', async () => {
    const module = await Test.createTestingModule({
      controllers: [
        DevicesController,
        PreferencesController,
        NotificationsController,
      ],
      providers: [DevicesService, PreferencesService, NotificationsService].map(
        (provide) => ({ provide, useValue: {} }),
      ),
    })
      .overrideGuard(TrustedGatewayGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    try {
      app.setGlobalPrefix('api/v1');
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      const operations = Object.values(document.paths).flatMap((path) =>
        Object.values(path),
      );
      expect(operations).toHaveLength(10);
      for (const operation of operations) {
        expect(operation.security).toEqual([{ bearer: [] }]);
        expect(
          operation.parameters?.filter(
            (parameter: { in?: string }) =>
              'in' in parameter && parameter.in === 'header',
          ) ?? [],
        ).toEqual([]);
      }
      const broadcast =
        document.paths['/api/v1/notifications/admin/broadcast'].post!;
      expect(broadcast.requestBody).toMatchObject({ required: true });
      const register = document.paths['/api/v1/notifications/devices'].post!;
      expect(register.requestBody).toMatchObject({ required: true });
      expect(
        document.paths['/api/v1/notifications/{id}'].get!.parameters,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path', required: true }),
        ]),
      );
    } finally {
      await app.close();
    }
  });
});
