import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AppException, buildSuccessResponse, ERROR_CODES } from '@app/common';
import { CandidatesAggregationService } from './candidates-aggregation.service.js';
import { QueryCandidatesDto } from './dto/query-candidates.dto.js';
import {
  CandidatesDataDto,
} from './dto/candidates-response.dto.js';
import type { UserContext } from './clients/order.client.js';

@ApiTags('Candidates')
@ApiBearerAuth('JWT-Auth')
@Controller('requests')
export class CandidatesController {
  constructor(
    private readonly candidatesAggregationService: CandidatesAggregationService,
  ) {}

  @Get(':requestId/candidates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy danh sách ứng viên (Bids và Top 5 Matching recommendations) cho yêu cầu dịch vụ',
    description:
      'BFF Aggregation endpoint tổng hợp các báo giá (Bidding) ở trên và tối đa Top 5 gợi ý thợ tối ưu (AI Matching) ở dưới. ' +
      'Tự động loại bỏ thợ trùng lặp giữa hai phân hệ (ưu tiên giữ trong Bidding và bổ sung thợ xếp hạng kế tiếp trong Matching). ' +
      'Bảo vệ quy tắc Đấu giá kín (Sealed-Bid) và đảm bảo chỉ chủ sở hữu yêu cầu hoặc Admin được truy cập.',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Mã định danh duy nhất (UUID v4) của Service Request',
    type: String,
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy danh sách ứng viên thành công',
    type: CandidatesDataDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Mã UUID yêu cầu dịch vụ hoặc tham số phân trang không hợp lệ',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Chưa đăng nhập hoặc token không hợp lệ',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không đủ quyền truy cập (không phải chủ sở hữu yêu cầu hoặc Admin)',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy yêu cầu dịch vụ',
  })
  async getCandidates(
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Query() query: QueryCandidatesDto,
    @Req() req: Request,
  ) {
    const rawUser = (req as any).user;
    const userId =
      (req.headers['x-user-id'] as string) || rawUser?.userId;

    if (!userId) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'Yêu cầu xác thực tài khoản để truy cập ứng viên',
      );
    }

    const rolesHeader = (req.headers['x-user-roles'] as string) || '';
    const roles = rolesHeader
      ? rolesHeader.split(',').map((r) => r.trim())
      : rawUser?.roles ?? [];

    const accountId =
      (req.headers['x-user-account-id'] as string) || rawUser?.accountId;
    const permissionsHeader =
      (req.headers['x-user-permissions'] as string) || '';
    const permissions = permissionsHeader
      ? permissionsHeader.split(',').map((p) => p.trim())
      : rawUser?.permissions ?? [];

    const userContext: UserContext = {
      userId,
      roles,
      accountId,
      permissions,
    };

    const existingReqId = req.headers['x-request-id'];
    const correlationId =
      (Array.isArray(existingReqId) ? existingReqId[0] : existingReqId) ||
      crypto.randomUUID();

    const data = await this.candidatesAggregationService.aggregateCandidates(
      requestId,
      query,
      userContext,
      correlationId,
    );

    return buildSuccessResponse(
      data,
      'Lấy danh sách ứng viên thành công',
      HttpStatus.OK,
    );
  }
}
