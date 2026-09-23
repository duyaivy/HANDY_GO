import { Controller, Get } from '@nestjs/common';
import { MatchingServiceService } from './matching-service.service.js';

@Controller()
export class MatchingServiceController {
  constructor(
    private readonly matchingServiceService: MatchingServiceService,
  ) {}

  @Get()
  getHello(): string {
    return this.matchingServiceService.getHello();
  }
}
