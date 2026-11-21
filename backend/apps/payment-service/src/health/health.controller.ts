import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Kiểm tra tình trạng hoạt động (Health check)',
    description:
      'Endpoint kiểm tra dịch vụ payment-service có đang sống và phản hồi bình thường hay không.',
  })
  @ApiResponse({ status: 200, description: 'Dịch vụ hoạt động tốt' })
  check() {
    return {
      status: 'ok',
      service: 'payment-service',
      timestamp: new Date().toISOString(),
    };
  }
}
