import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { buildSuccessResponse } from '@app/common';
import {
  CurrentUser,
  type RequestUserIdentity,
} from '../common/decorators/current-user.decorator.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { OrdersService } from './orders.service.js';
import { AdminQueryOrderDto } from './dto/admin-query-order.dto.js';
import { AdminQueryDisputesDto } from './dto/admin-query-disputes.dto.js';
import { AdminDisputeListResponseDto } from './dto/admin-dispute-list-response.dto.js';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';

@ApiTags('Admin Orders')
@ApiBearerAuth()
@UseGuards(TrustedGatewayGuard, AdminGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'Admin query all orders in system (ORD-08)',
    description:
      'Allows Administrators to view and filter all orders across customers and workers.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orders retrieved successfully',
  })
  async findAll(
    @CurrentUser() user: RequestUserIdentity,
    @Query() query: AdminQueryOrderDto,
  ) {
    const data = await this.ordersService.adminFindAll(query, user.roles);
    return buildSuccessResponse(data, 'Admin orders retrieved successfully');
  }

  @Get('disputes')
  @ApiOperation({
    summary: 'Admin query active disputes (HG-82)',
    description:
      'Search, filter, sort and paginate orders currently in dispute, including dispute evidence and both party IDs.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Disputes retrieved successfully',
    type: AdminDisputeListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only administrators can access the dispute queue',
  })
  async findDisputes(
    @CurrentUser() user: RequestUserIdentity,
    @Query() query: AdminQueryDisputesDto,
  ) {
    const data = await this.ordersService.adminFindDisputes(query, user.roles);
    return buildSuccessResponse(data, 'Admin disputes retrieved successfully');
  }

  @Post(':id/resolve-dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin resolves dispute (ORD-08)',
    description:
      'Administrator resolves an active dispute with reason and action (resume_previous_state, cancel, complete). Completing emits order.completed for settlement.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiBody({ type: ResolveDisputeDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dispute resolved successfully',
    type: OrderResponseDto,
  })
  async resolveDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
    @Body() dto: ResolveDisputeDto,
  ) {
    const data = await this.ordersService.resolveDispute(
      id,
      user.userId,
      dto,
      user.roles,
    );
    return buildSuccessResponse(data, 'Dispute resolved successfully');
  }
}
