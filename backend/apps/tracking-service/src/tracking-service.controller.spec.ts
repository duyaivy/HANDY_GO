import { Test, TestingModule } from '@nestjs/testing';
import { TrackingServiceController } from './tracking-service.controller.js';
import { TrackingServiceService } from './tracking-service.service.js';

describe('TrackingServiceController', () => {
  let trackingServiceController: TrackingServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [TrackingServiceController],
      providers: [TrackingServiceService],
    }).compile();

    trackingServiceController = app.get<TrackingServiceController>(TrackingServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(trackingServiceController.getHello()).toBe('Hello World!');
    });
  });
});
