import { Controller, Get } from '@nestjs/common';
import { BiddingServiceService } from './bidding-service.service.js';

@Controller()
export class BiddingServiceController {
  constructor(private readonly biddingServiceService: BiddingServiceService) {}

  @Get()
  getHello(): string {
    return this.biddingServiceService.getHello();
  }
}
