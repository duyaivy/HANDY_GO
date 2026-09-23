import { Controller, Get, Headers } from '@nestjs/common';
import { ApiGatewayService } from './api-gateway.service.js';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @Get()
  getHello(): string {
    return this.apiGatewayService.getHello();
  }

  @Get('services/auth/health')
  getAuthHealth(@Headers('x-request-id') requestId?: string): Promise<unknown> {
    return this.apiGatewayService.getAuthHealth(requestId);
  }
}
