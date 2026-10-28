import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import { buildSuccessResponse } from '@app/common';
import { Public } from '@app/auth';
import { BidsService } from './bids.service.js';
import { SubmitBidDto } from './dto/submit-bid.dto.js';
import { ReviseBidDto } from './dto/revise-bid.dto.js';
import { WithdrawBidDto } from './dto/withdraw-bid.dto.js';
import { QueryBidsDto } from './dto/query-bids.dto.js';
import {
  BidListResponseDto,
  BidResponseDto,
} from './dto/bid-response.dto.js';
import {
  BidEligibilityQueryDto,
  BidEligibilityResponseDto,
} from './dto/bid-eligibility.dto.js';
import {
  assertTrustedGateway,
  extractWorkerIdentity,
} from '../common/utils/security.util.js';

@ApiTags('Báo giá (Bids)')
@ApiBearerAuth()
@Controller()
export class BidsController {
  constructor(
    private readonly bidsService: BidsService,
    private readonly config: ConfigService,
  ) {}

  // --------------------------------------------------------------------------
  // BID SUBMISSION (BID-03)
  // --------------------------------------------------------------------------

  @Post('requests/:id/bids')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Gửi báo giá cho yêu cầu dịch vụ',
    description:
      'Thợ đủ điều kiện gửi báo giá cho yêu cầu dịch vụ đang mở. Hệ thống kiểm tra trạng thái vòng đấu thầu, mức giá và chống gửi trùng lặp.',
  })
  @ApiParam({ name: 'id', description: 'Mã định danh duy nhất (UUID) của yêu cầu dịch vụ', type: String })
  @ApiHeader({ name: 'x-user-id', description: 'Mã người dùng (Thợ) do API Gateway chuyển tiếp' })
  @ApiHeader({ name: 'x-user-roles', description: 'Vai trò người dùng do API Gateway chuyển tiếp' })
  @ApiHeader({ name: 'x-internal-secret', description: 'Mã khóa nội bộ từ Trusted Gateway' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Gửi báo giá thành công',
    type: BidResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Thợ đã gửi báo giá cho yêu cầu dịch vụ này trước đó',
  })
  async submitBid(
    @Param('id', new ParseUUIDPipe({ version: '4' })) serviceRequestId: string,
    @Body() dto: SubmitBidDto,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') userRoles: string | undefined,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    assertTrustedGateway(internalSecret, this.config.internalServiceSecret);
    const workerId = extractWorkerIdentity(userId, userRoles);
    const data = await this.bidsService.submitBid(workerId, serviceRequestId, dto);
    return buildSuccessResponse(
      data,
      'Gửi báo giá thành công',
      HttpStatus.CREATED,
    );
  }

  @Post('bids/requests/:id')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tuyến đường phụ để gửi báo giá (Alias route)' })
  async submitBidAlias(
    @Param('id', new ParseUUIDPipe({ version: '4' })) serviceRequestId: string,
    @Body() dto: SubmitBidDto,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') userRoles: string | undefined,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    return this.submitBid(serviceRequestId, dto, userId, userRoles, internalSecret);
  }

  // --------------------------------------------------------------------------
  // BID REVISION & WITHDRAWAL (BID-04)
  // --------------------------------------------------------------------------

  @Patch('bids/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Điều chỉnh báo giá đang hoạt động',
    description:
      'Thợ cập nhật mức giá, lời nhắn hoặc thời hạn hiệu lực. Áp dụng cơ chế khóa lạc quan (optimistic locking) qua trường version.',
  })
  @ApiParam({ name: 'id', description: 'Mã định danh duy nhất (UUID) của báo giá', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Điều chỉnh báo giá thành công',
    type: BidResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Xung đột phiên bản dữ liệu (đã có cập nhật đồng thời)',
  })
  async reviseBid(
    @Param('id', new ParseUUIDPipe({ version: '4' })) bidId: string,
    @Body() dto: ReviseBidDto,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') userRoles: string | undefined,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    assertTrustedGateway(internalSecret, this.config.internalServiceSecret);
    const workerId = extractWorkerIdentity(userId, userRoles);
    const data = await this.bidsService.reviseBid(workerId, bidId, dto);
    return buildSuccessResponse(
      data,
      'Điều chỉnh báo giá thành công',
      HttpStatus.OK,
    );
  }

  @Post('bids/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rút báo giá',
    description:
      'Thợ tự nguyện rút lại báo giá khi phiên báo giá vẫn đang mở.',
  })
  @ApiParam({ name: 'id', description: 'Mã định danh duy nhất (UUID) của báo giá', type: String })
  @ApiBody({ type: WithdrawBidDto, required: true })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Rút báo giá thành công',
    type: BidResponseDto,
  })
  async withdrawBid(
    @Param('id', new ParseUUIDPipe({ version: '4' })) bidId: string,
    @Body() dto: WithdrawBidDto,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') userRoles: string | undefined,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    assertTrustedGateway(internalSecret, this.config.internalServiceSecret);
    const workerId = extractWorkerIdentity(userId, userRoles);
    const data = await this.bidsService.withdrawBid(workerId, bidId, dto);
    return buildSuccessResponse(
      data,
      'Rút báo giá thành công',
      HttpStatus.OK,
    );
  }

  // --------------------------------------------------------------------------
  // BID LISTING (BID-05)
  // --------------------------------------------------------------------------

  @Public()
  @Get('requests/:id/bids')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy danh sách báo giá theo yêu cầu dịch vụ (Hỗ trợ Sealed-Bid)',
    description:
      'Trả về danh sách báo giá sắp xếp mới nhất (submittedAt DESC). Khách hàng xem được toàn bộ giá; thợ đối thủ chỉ thấy trạng thái báo giá kín (isMasked). Bấm xem không làm đổi trạng thái sang selected.',
  })
  @ApiParam({ name: 'id', description: 'Mã định danh duy nhất (UUID) của yêu cầu dịch vụ', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy danh sách báo giá thành công',
    type: BidListResponseDto,
  })
  async getBidsForRequest(
    @Param('id', new ParseUUIDPipe({ version: '4' })) serviceRequestId: string,
    @Query() query: QueryBidsDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-roles') userRoles?: string,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    const data = await this.bidsService.getBidsForRequest(
      serviceRequestId,
      query,
      userId,
      userRoles,
      internalSecret,
    );
    return buildSuccessResponse(
      data,
      'Lấy danh sách báo giá thành công',
      HttpStatus.OK,
    );
  }

  @Public()
  @Get('bids/requests/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tuyến đường phụ để lấy danh sách báo giá của yêu cầu dịch vụ (Alias route)' })
  async getBidsForRequestAlias(
    @Param('id', new ParseUUIDPipe({ version: '4' })) serviceRequestId: string,
    @Query() query: QueryBidsDto,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-roles') userRoles?: string,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    return this.getBidsForRequest(serviceRequestId, query, userId, userRoles, internalSecret);
  }

  @Get('bids/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy danh sách báo giá của thợ hiện tại',
    description: 'Trả về toàn bộ các báo giá mà thợ đang đăng nhập đã gửi.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy danh sách báo giá của thợ thành công',
    type: BidListResponseDto,
  })
  async getMyBids(
    @Query() query: QueryBidsDto,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') userRoles: string | undefined,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    assertTrustedGateway(internalSecret, this.config.internalServiceSecret);
    const workerId = extractWorkerIdentity(userId, userRoles);
    const data = await this.bidsService.getMyBids(workerId, query);
    return buildSuccessResponse(
      data,
      'Lấy danh sách báo giá của tôi thành công',
      HttpStatus.OK,
    );
  }

  @Public()
  @Get('bids/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy chi tiết báo giá kèm lịch sử điều chỉnh (Tuân thủ Sealed-Bid)',
    description: 'Trả về thông tin chi tiết của báo giá. Thợ đối thủ không thể xem giá và lịch sử điều chỉnh của người khác.',
  })
  @ApiParam({ name: 'id', description: 'Mã định danh duy nhất (UUID) của báo giá', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy thông tin báo giá thành công',
    type: BidResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy báo giá với mã định danh cung cấp',
  })
  async getBidById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) bidId: string,
    @Headers('x-user-id') userId?: string,
    @Headers('x-user-roles') userRoles?: string,
    @Headers('x-internal-secret') internalSecret?: string,
  ) {
    const data = await this.bidsService.getBidById(
      bidId,
      userId,
      userRoles,
      internalSecret,
    );
    return buildSuccessResponse(
      data,
      'Lấy thông tin báo giá thành công',
      HttpStatus.OK,
    );
  }

  // --------------------------------------------------------------------------
  // INTERNAL API: BID ELIGIBILITY FOR ORDER SERVICE (BID-06)
  // --------------------------------------------------------------------------

  @Public()
  @Get('internal/bids/:bidId/eligibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra tính hợp lệ của báo giá để tạo đơn hàng (Internal API dành cho Order Service)',
    description:
      'Endpoint nội bộ do Order Service gọi để xác thực báo giá trước khi tạo bản ghi đề xuất đặt lịch (Booking Proposal).',
  })
  @ApiParam({ name: 'bidId', description: 'Mã định danh duy nhất (UUID) của báo giá', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Kết quả kiểm tra tính hợp lệ của báo giá',
    type: BidEligibilityResponseDto,
  })
  async checkEligibility(
    @Param('bidId', new ParseUUIDPipe({ version: '4' })) bidId: string,
    @Query() query: BidEligibilityQueryDto,
    @Headers('x-internal-secret') internalSecret: string | undefined,
  ) {
    assertTrustedGateway(internalSecret, this.config.internalServiceSecret);
    const data = await this.bidsService.checkEligibility(bidId, query);
    return buildSuccessResponse(
      data,
      'Kiểm tra tính hợp lệ của báo giá thành công',
      HttpStatus.OK,
    );
  }
}
