import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
  CurrentUserId,
  type RequestUserIdentity,
} from '../common/decorators/current-user.decorator.js';
import { OrdersService } from './orders.service.js';
import { QueryOrderDto } from './dto/query-order.dto.js';
import { OrderResponseDto } from './dto/order-response.dto.js';
import { CreateOrderEvidenceDto } from './dto/create-order-evidence.dto.js';
import { OrderEvidenceResponseDto } from './dto/order-evidence-response.dto.js';
import { RequestReworkDto } from './dto/request-rework.dto.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { DisputeOrderDto } from './dto/dispute-order.dto.js';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'List my orders',
    description:
      'Retrieves a paginated list of orders where the current user is customer or worker.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Orders retrieved successfully',
  })
  async findAll(
    @CurrentUser() user: RequestUserIdentity,
    @Query() query: QueryOrderDto,
  ) {
    const data = await this.ordersService.findAll(
      user.userId,
      query,
      user.roles,
    );
    return buildSuccessResponse(data, 'Orders retrieved successfully');
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get details of an order',
    description:
      'Retrieves single order details including address snapshot, evidences, and status history.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order retrieved successfully',
    type: OrderResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
  ) {
    const data = await this.ordersService.findById(
      id,
      user.userId,
      user.roles,
    );
    return buildSuccessResponse(data, 'Order retrieved successfully');
  }

  @Get(':id/status-history')
  @ApiOperation({
    summary: 'Get status history of an order',
    description: 'Retrieves chronological state transition timeline of an order.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Status history retrieved successfully',
  })
  async getStatusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
  ) {
    const data = await this.ordersService.getStatusHistory(
      id,
      user.userId,
      user.roles,
    );
    return buildSuccessResponse(data, 'Status history retrieved successfully');
  }

  @Post(':id/confirm-readiness')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker confirms readiness (ORD-07)',
    description: 'Worker confirms readiness to execute the order (created -> confirmed).',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order readiness confirmed successfully',
    type: OrderResponseDto,
  })
  async confirmReadiness(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.ordersService.confirmReadiness(id, userId);
    return buildSuccessResponse(
      data,
      'Order readiness confirmed successfully',
    );
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker starts working (ORD-07)',
    description:
      'Worker starts executing the job (confirmed -> in_progress). Does not block on payment holding.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order started successfully',
    type: OrderResponseDto,
  })
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.ordersService.start(id, userId);
    return buildSuccessResponse(data, 'Order started successfully');
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker reports completion (ORD-07, ORD-10)',
    description:
      'Worker reports work done (in_progress -> awaiting_customer_confirmation). Strictly requires at least 1 evidence attachment.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order finish reported successfully',
    type: OrderResponseDto,
  })
  async finish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.ordersService.finish(id, userId);
    return buildSuccessResponse(
      data,
      'Order finish reported successfully, awaiting customer confirmation',
    );
  }

  @Post(':id/confirm-completion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Customer confirms completion (ORD-07)',
    description:
      'Customer confirms work is satisfactorily completed (awaiting_customer_confirmation -> completed). Emits order.completed event for payment settlement.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order completion confirmed successfully',
    type: OrderResponseDto,
  })
  async confirmCompletion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.ordersService.confirmCompletion(id, userId);
    return buildSuccessResponse(
      data,
      'Order completion confirmed successfully',
    );
  }

  @Post(':id/request-rework')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Customer requests rework (ORD-07)',
    description:
      'Customer requests worker to fix issues (awaiting_customer_confirmation -> in_progress). Requires reason.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiBody({ type: RequestReworkDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Rework requested successfully',
    type: OrderResponseDto,
  })
  async requestRework(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
    @Body() dto: RequestReworkDto,
  ) {
    const data = await this.ordersService.requestRework(id, userId, dto);
    return buildSuccessResponse(data, 'Rework requested successfully');
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel order (ORD-08)',
    description:
      'Participant or Admin cancels the order before execution (created or confirmed status only).',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiBody({ type: CancelOrderDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Order cancelled successfully',
    type: OrderResponseDto,
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
    @Body() dto: CancelOrderDto,
  ) {
    const data = await this.ordersService.cancel(
      id,
      user.userId,
      dto,
      user.roles,
    );
    return buildSuccessResponse(data, 'Order cancelled successfully');
  }

  @Post(':id/evidence')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload proof of work evidence (ORD-10)',
    description:
      'Worker attaches Cloudinary media URL to an in_progress order as proof of work.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiBody({ type: CreateOrderEvidenceDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Evidence attached successfully',
    type: OrderEvidenceResponseDto,
  })
  async addEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
    @Body() dto: CreateOrderEvidenceDto,
  ) {
    const data = await this.ordersService.addEvidence(id, userId, dto);
    return buildSuccessResponse(
      data,
      'Evidence attached successfully',
      HttpStatus.CREATED,
    );
  }

  @Get(':id/evidence')
  @ApiOperation({
    summary: 'View proof of work evidences (ORD-10)',
    description: 'Lists all evidences uploaded for this order.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Evidences retrieved successfully',
    type: [OrderEvidenceResponseDto],
  })
  async getEvidences(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
  ) {
    const data = await this.ordersService.getEvidences(
      id,
      user.userId,
      user.roles,
    );
    return buildSuccessResponse(data, 'Evidences retrieved successfully');
  }

  @Delete(':id/evidence/:evidenceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete proof of work evidence (ORD-10)',
    description: 'Worker deletes an evidence prior to submitting completion.',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiParam({ name: 'evidenceId', description: 'Evidence UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Evidence deleted successfully',
  })
  async deleteEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUserId() userId: string,
  ) {
    await this.ordersService.deleteEvidence(id, evidenceId, userId);
    return buildSuccessResponse(null, 'Evidence deleted successfully');
  }

  @Post(':id/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Open a dispute (ORD-08)',
    description:
      'Customer or Worker opens a dispute during execution (in_progress or awaiting_customer_confirmation).',
  })
  @ApiParam({ name: 'id', description: 'Order UUID' })
  @ApiBody({ type: DisputeOrderDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dispute opened successfully',
    type: OrderResponseDto,
  })
  async dispute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
    @Body() dto: DisputeOrderDto,
  ) {
    const data = await this.ordersService.dispute(id, userId, dto);
    return buildSuccessResponse(data, 'Dispute opened successfully');
  }
}
