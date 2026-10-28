import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RoundsService } from './rounds.service.js';
import {
  BiddingStatusResponseDto,
  BiddingStatusResponseDtoEnvelope,
} from './dto/bidding-status-response.dto.js';
import { buildSuccessResponse, type ApiResponseEnvelope } from '@app/common';
import { Public } from '@app/auth';

@ApiTags('Phiên báo giá (Bidding Rounds)')
@Controller()
export class RoundsController {
  constructor(private readonly roundsService: RoundsService) {}

  @Public()
  @Get('requests/:id/bidding-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy trạng thái phiên báo giá theo mã yêu cầu dịch vụ',
    description:
      'Trả về trạng thái phiên (open, closed, no_bid, finalized, cancelled), thời gian còn lại, số lượng báo giá và tự động cập nhật khi phiên hết hạn.',
  })
  @ApiParam({
    name: 'id',
    description: 'Mã định danh duy nhất (UUID) của yêu cầu dịch vụ',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy trạng thái phiên báo giá thành công',
    type: BiddingStatusResponseDtoEnvelope,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy phiên báo giá cho yêu cầu dịch vụ này',
  })
  async getStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ApiResponseEnvelope<BiddingStatusResponseDto>> {
    const data = await this.roundsService.getBiddingStatus(id);
    return buildSuccessResponse(
      data,
      'Lấy trạng thái phiên báo giá thành công',
      HttpStatus.OK,
    );
  }

  @Public()
  @Get('bids/requests/:id/bidding-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đường dẫn phụ lấy trạng thái phiên báo giá theo yêu cầu dịch vụ',
    description: 'Định tuyến thay thế hỗ trợ client và API Gateway',
  })
  async getStatusAlias(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ApiResponseEnvelope<BiddingStatusResponseDto>> {
    return this.getStatus(id);
  }
}

