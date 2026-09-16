import { Test, TestingModule } from '@nestjs/testing';
import { UserTrustServiceController } from './user-trust-service.controller.js';
import { UserTrustServiceService } from './user-trust-service.service.js';

describe('UserTrustServiceController', () => {
  let userTrustServiceController: UserTrustServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [UserTrustServiceController],
      providers: [UserTrustServiceService],
    }).compile();

    userTrustServiceController = app.get<UserTrustServiceController>(UserTrustServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(userTrustServiceController.getHello()).toBe('Hello World!');
    });
  });
});
