import { Test, TestingModule } from '@nestjs/testing';
import { BiddingServiceController } from './bidding-service.controller.js';
import { BiddingServiceService } from './bidding-service.service.js';

describe('BiddingServiceController', () => {
  let biddingServiceController: BiddingServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [BiddingServiceController],
      providers: [BiddingServiceService],
    }).compile();

    biddingServiceController = app.get<BiddingServiceController>(BiddingServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(biddingServiceController.getHello()).toBe('Hello World!');
    });
  });
});
