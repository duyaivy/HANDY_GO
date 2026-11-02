import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import { BookingProposalsService } from './booking-proposals.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { CreateBookingProposalDto } from './dto/create-booking-proposal.dto.js';
import { RequestChangesProposalDto } from './dto/request-changes-proposal.dto.js';
import { RejectProposalDto } from './dto/reject-proposal.dto.js';
import { QueryBookingProposalDto } from './dto/query-booking-proposal.dto.js';
import { BookingProposalResponseDto } from './dto/booking-proposal-response.dto.js';
import { OrderResponseDto } from '../orders/dto/order-response.dto.js';

@ApiTags('Booking Proposals')
@ApiBearerAuth()
@Controller('booking-proposals')
export class BookingProposalsController {
  private readonly logger = new Logger(BookingProposalsController.name);

  constructor(
    private readonly bookingProposalsService: BookingProposalsService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new booking proposal or new revision (ORD-04, ORD-05)',
    description:
      'Creates a pre-order booking proposal. To create revision > 1, provide supersedesProposalId pointing to a changes_requested proposal.',
  })
  @ApiBody({ type: CreateBookingProposalDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Booking proposal created successfully',
    type: BookingProposalResponseDto,
  })
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateBookingProposalDto,
  ) {
    if (dto.autoAccept) {
      throw new BadRequestException(
        'autoAccept=true is not supported. Booking proposals must be accepted by the assigned worker.',
      );
    }
    const data = await this.bookingProposalsService.create(userId, dto);
    return buildSuccessResponse(
      data,
      'Booking proposal created successfully',
      HttpStatus.CREATED,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List booking proposals',
    description:
      'Retrieves a paginated list of booking proposals involving the current user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Booking proposals retrieved successfully',
  })
  async findAll(
    @CurrentUser() user: RequestUserIdentity,
    @Query() query: QueryBookingProposalDto,
  ) {
    const data = await this.bookingProposalsService.findAll(
      user.userId,
      query,
      user.roles,
    );
    return buildSuccessResponse(
      data,
      'Booking proposals retrieved successfully',
    );
  }

  @Get('me')
  @ApiOperation({
    summary: 'List proposals received by current worker',
    description:
      'Retrieves proposals where current user is the target workerUserId.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Received proposals retrieved successfully',
  })
  async findMyReceived(
    @CurrentUserId() userId: string,
    @Query() query: QueryBookingProposalDto,
  ) {
    const data = await this.bookingProposalsService.findMyReceivedProposals(
      userId,
      query,
    );
    return buildSuccessResponse(
      data,
      'Received booking proposals retrieved successfully',
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get details of a booking proposal',
    description:
      'Retrieves single booking proposal details including revisions history.',
  })
  @ApiParam({ name: 'id', description: 'Booking Proposal UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Booking proposal retrieved successfully',
    type: BookingProposalResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
  ) {
    const data = await this.bookingProposalsService.findById(
      id,
      user.userId,
      user.roles,
    );
    return buildSuccessResponse(
      data,
      'Booking proposal retrieved successfully',
    );
  }

  @Post(':id/request-changes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker requests changes on terms (ORD-05)',
    description:
      'Worker rejects current terms and requests customer to issue a new revision with modified price/scope/schedule.',
  })
  @ApiParam({ name: 'id', description: 'Booking Proposal UUID' })
  @ApiBody({ type: RequestChangesProposalDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Change request recorded successfully',
    type: BookingProposalResponseDto,
  })
  async requestChanges(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
    @Body() dto: RequestChangesProposalDto,
  ) {
    const data = await this.bookingProposalsService.requestChanges(
      id,
      userId,
      dto,
    );
    return buildSuccessResponse(
      data,
      'Change request recorded successfully',
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker rejects proposal',
    description: 'Worker declines to take the job.',
  })
  @ApiParam({ name: 'id', description: 'Booking Proposal UUID' })
  @ApiBody({ type: RejectProposalDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Booking proposal rejected successfully',
    type: BookingProposalResponseDto,
  })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
    @Body() dto: RejectProposalDto,
  ) {
    const data = await this.bookingProposalsService.reject(id, userId, dto);
    return buildSuccessResponse(
      data,
      'Booking proposal rejected successfully',
    );
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Customer withdraws proposal',
    description:
      'Customer revokes proposal while it is still awaiting worker response.',
  })
  @ApiParam({ name: 'id', description: 'Booking Proposal UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Booking proposal withdrawn successfully',
    type: BookingProposalResponseDto,
  })
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.bookingProposalsService.withdraw(id, userId);
    return buildSuccessResponse(
      data,
      'Booking proposal withdrawn successfully',
    );
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Worker accepts proposal to create order atomically (ORD-06)',
    description:
      'Worker accepts proposal. Executes single ACID transaction: locks rows, creates order, snapshots address, finalizes proposal, supersedes competing proposals, marks request converted_to_order, writes order status history, and emits outbox order.created.',
  })
  @ApiParam({ name: 'id', description: 'Booking Proposal UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Booking proposal accepted and order created successfully',
    type: OrderResponseDto,
  })
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.ordersService.acceptProposal(id, userId);
    return buildSuccessResponse(
      data,
      'Booking proposal accepted and order created successfully',
    );
  }
}
