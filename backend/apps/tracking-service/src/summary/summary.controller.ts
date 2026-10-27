import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { buildSuccessResponse } from '@app/common';
import { TrustedGatewayGuard } from '../common/security/trusted-gateway.guard.js';
import { CurrentGatewayUser } from '../common/security/gateway-user.decorator.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';
import { SummaryService } from './summary.service.js';
import { TrackingSummaryResponseDto } from './dto/summary-response.dto.js';

@ApiTags('Tracking Summary')
@ApiBearerAuth()
@UseGuards(TrustedGatewayGuard)
@Controller('tracking')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get('requests/:id/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tổng hợp tiến trình để frontend hiển thị theo Service Request ID',
    description:
      'Tổng hợp các mốc tiến trình (Request -> Matching -> Bidding -> Proposal -> Order -> Payment). Phân quyền Customer/Worker/Admin, không để lộ thông tin báo giá của thợ khác.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'Service Request ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy tổng hợp tiến trình thành công',
    type: TrackingSummaryResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập tổng hợp tiến trình' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tiến trình theo dõi' })
  async getRequestSummary(
    @Param('id', ParseUUIDPipe) serviceRequestId: string,
    @CurrentGatewayUser() user: GatewayUser,
  ) {
    const data = await this.summaryService.getRequestSummary(
      serviceRequestId,
      user,
    );
    return buildSuccessResponse(
      data,
      'Lấy tổng hợp tiến trình yêu cầu thành công',
      HttpStatus.OK,
    );
  }
}
