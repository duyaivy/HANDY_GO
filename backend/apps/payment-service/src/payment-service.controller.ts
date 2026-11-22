import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentServiceService } from './payment-service.service.js';

@ApiTags('System')
@Controller()
export class PaymentServiceController {
  constructor(private readonly paymentServiceService: PaymentServiceService) {}

  @Get()
  @ApiOperation({
    summary: 'Kiểm tra hoạt động dịch vụ (Root endpoint)',
    description:
      'Endpoint mặc định trả về thông báo chào mừng từ Payment Service.',
  })
  @ApiResponse({ status: 200, description: 'Dịch vụ đang hoạt động.' })
  getHello(): string {
    return this.paymentServiceService.getHello();
  }
}
