import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { buildSuccessResponse } from '@app/common';
import { TrustedGatewayGuard } from '../common/security/trusted-gateway.guard.js';
import { CurrentGatewayUser } from '../common/security/gateway-user.decorator.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';
import { TimelineStreamService } from '../common/stream/timeline-stream.service.js';
import { TimelineService } from './timeline.service.js';
import { TimelineQueryDto } from './dto/timeline-query.dto.js';
import { TimelineListResponseDto } from './dto/timeline-response.dto.js';

@ApiTags('Tracking Timeline')
@ApiBearerAuth()
@UseGuards(TrustedGatewayGuard)
@Controller('tracking')
export class TimelineController {
  constructor(
    private readonly timelineService: TimelineService,
    private readonly timelineStreamService: TimelineStreamService,
  ) {}

  @Sse('requests/:id/live')
  @ApiOperation({
    summary: 'Đăng ký dòng thời gian sự kiện theo thời gian thực (SSE Live Stream)',
    description:
      'Mở kết nối Server-Sent Events (SSE) theo dõi sự kiện của Service Request theo thời gian thực. Hỗ trợ khôi phục sự kiện bị lỡ khi reconnect qua Last-Event-ID header hoặc query param lastEventId.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'Service Request ID',
  })
  @ApiQuery({
    name: 'lastEventId',
    required: false,
    type: 'string',
    description: 'ID sự kiện cuối cùng nhận được trước khi mất kết nối',
  })
  @ApiResponse({
    status: 200,
    description: 'Kết nối SSE thành công (Content-Type: text/event-stream)',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền theo dõi yêu cầu' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tiến trình theo dõi' })
  async streamLiveTimeline(
    @Param('id', ParseUUIDPipe) serviceRequestId: string,
    @CurrentGatewayUser() user: GatewayUser,
    @Headers('last-event-id') lastEventIdHeader?: string,
    @Query('lastEventId') lastEventIdQuery?: string,
  ): Promise<Observable<MessageEvent>> {
    const lastEventId = lastEventIdHeader || lastEventIdQuery;
    return this.timelineStreamService.getLiveStream(
      serviceRequestId,
      user,
      lastEventId,
    );
  }

  @Get('requests/:id/timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy dòng thời gian tiến trình (timeline) theo Service Request ID',
    description:
      'Truy vấn lịch sử tiến trình của Request. Phân quyền Customer/Worker/Admin, thợ chỉ thấy các sự kiện liên quan và không thấy báo giá của đối thủ.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'Service Request ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy timeline thành công',
    type: TimelineListResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xem tiến trình' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tiến trình theo dõi' })
  async getRequestTimeline(
    @Param('id', ParseUUIDPipe) serviceRequestId: string,
    @Query() query: TimelineQueryDto,
    @CurrentGatewayUser() user: GatewayUser,
  ) {
    const data = await this.timelineService.getRequestTimeline(
      serviceRequestId,
      query,
      user,
    );
    return buildSuccessResponse(
      data,
      'Lấy lịch sử tiến trình yêu cầu thành công',
      HttpStatus.OK,
    );
  }

  @Get('bids/:id/timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy dòng thời gian tiến trình của một báo giá (Bid ID)',
    description:
      'Truy vấn lịch sử nộp/sửa/rút/chọn báo giá. Chỉ thợ sở hữu báo giá, khách hàng của request hoặc admin mới được xem.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'Bid ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy timeline báo giá thành công',
    type: TimelineListResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xem báo giá' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lịch sử báo giá' })
  async getBidTimeline(
    @Param('id', ParseUUIDPipe) bidId: string,
    @Query() query: TimelineQueryDto,
    @CurrentGatewayUser() user: GatewayUser,
  ) {
    const data = await this.timelineService.getBidTimeline(bidId, query, user);
    return buildSuccessResponse(
      data,
      'Lấy lịch sử báo giá thành công',
      HttpStatus.OK,
    );
  }

  @Get('orders/:id/timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy dòng thời gian tiến trình của đơn hàng (Order ID)',
    description:
      'Truy vấn lịch sử tạo/bắt đầu/hoàn tất/hủy/thanh toán của đơn hàng. Chỉ khách hàng, thợ thực hiện hoặc admin mới được xem.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'Order ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy timeline đơn hàng thành công',
    type: TimelineListResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xem đơn hàng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy tiến trình đơn hàng' })
  async getOrderTimeline(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Query() query: TimelineQueryDto,
    @CurrentGatewayUser() user: GatewayUser,
  ) {
    const data = await this.timelineService.getOrderTimeline(
      orderId,
      query,
      user,
    );
    return buildSuccessResponse(
      data,
      'Lấy lịch sử đơn hàng thành công',
      HttpStatus.OK,
    );
  }
}
