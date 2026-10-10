import { Controller, Get } from '@nestjs/common';
import { Public } from '@app/auth';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'catalog-service',
      timestamp: new Date().toISOString(),
    };
  }
}
