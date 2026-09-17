import { Controller, Get } from '@nestjs/common';
import { UserTrustServiceService } from './user-trust-service.service.js';

@Controller()
export class UserTrustServiceController {
  constructor(
    private readonly userTrustServiceService: UserTrustServiceService,
  ) {}

  @Get()
  getHello(): string {
    return this.userTrustServiceService.getHello();
  }
}
