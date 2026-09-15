import { Test, TestingModule } from '@nestjs/testing';
import { UserServiceController } from './user-service.controller.js';
import { UserServiceService } from './user-service.service.js';

describe('UserServiceController', () => {
  let userServiceController: UserServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [UserServiceController],
      providers: [UserServiceService],
    }).compile();

    userServiceController = app.get<UserServiceController>(UserServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(userServiceController.getHello()).toBe('Hello World!');
    });
  });
});
