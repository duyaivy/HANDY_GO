import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ServiceRequestsService } from './service-requests.service.js';
import { BookingProposalsService } from '../booking-proposals/booking-proposals.service.js';
import {
  CreateServiceRequestDto,
  ServiceRequestMediaDto,
} from './dto/create-service-request.dto.js';
import { UpdateServiceRequestDto } from './dto/update-service-request.dto.js';
import { QueryServiceRequestDto } from './dto/query-service-request.dto.js';
import {
  ServiceRequestMediaResponseDto,
  ServiceRequestResponseDto,
} from './dto/service-request-response.dto.js';

@ApiTags('Service Requests')
@ApiBearerAuth()
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequestsService: ServiceRequestsService,
    private readonly bookingProposalsService: BookingProposalsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new draft service request',
    description:
      'Creates a new service request in draft status. Can include pre-uploaded media URLs from API Gateway.',
  })
  @ApiBody({ type: CreateServiceRequestDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Draft service request created successfully',
    type: ServiceRequestResponseDto,
  })
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateServiceRequestDto,
  ) {
    const data = await this.serviceRequestsService.createDraft(userId, dto);
    return buildSuccessResponse(
      data,
      'Service request draft created successfully',
      HttpStatus.CREATED,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List service requests of authenticated user',
    description:
      'Returns a paginated list of service requests created by the current user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of service requests retrieved successfully',
  })
  async findAll(
    @CurrentUserId() userId: string,
    @Query() query: QueryServiceRequestDto,
  ) {
    const data = await this.serviceRequestsService.findAll(userId, query);
    return buildSuccessResponse(
      data,
      'Service requests retrieved successfully',
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get details of a specific service request',
    description:
      'Retrieves full details of a service request including attached media, proposals, and linked order.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service request details retrieved successfully',
    type: ServiceRequestResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
  ) {
    const data = await this.serviceRequestsService.findById(
      id,
      user.userId,
      user.roles,
    );
    return buildSuccessResponse(
      data,
      'Service request details retrieved successfully',
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update draft service request',
    description:
      'Updates fields of a service request. Allowed only when status is draft.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiBody({ type: UpdateServiceRequestDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Draft service request updated successfully',
    type: ServiceRequestResponseDto,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateServiceRequestDto,
  ) {
    const data = await this.serviceRequestsService.updateDraft(
      id,
      userId,
      dto,
    );
    return buildSuccessResponse(
      data,
      'Service request draft updated successfully',
    );
  }

  @Post(':id/media')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add media link to draft service request (ORD-02)',
    description:
      'Attaches a pre-uploaded Cloudinary media URL from API Gateway to the draft request.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiBody({ type: ServiceRequestMediaDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Media attached to service request successfully',
    type: ServiceRequestMediaResponseDto,
  })
  async addMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
    @Body() dto: ServiceRequestMediaDto,
  ) {
    const data = await this.serviceRequestsService.addMedia(id, userId, dto);
    return buildSuccessResponse(
      data,
      'Media attached to service request successfully',
      HttpStatus.CREATED,
    );
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete media item from draft service request (ORD-02)',
    description: 'Removes an attached media item from a draft request.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiParam({ name: 'mediaId', description: 'Request Media UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Media deleted from service request successfully',
  })
  async deleteMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUserId() userId: string,
  ) {
    await this.serviceRequestsService.deleteMedia(id, mediaId, userId);
    return buildSuccessResponse(
      null,
      'Media deleted from service request successfully',
    );
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a draft service request (ORD-03)',
    description:
      'Validates all required fields, transitions status to open_for_bidding, calculates 24h bidding and 48h selection deadlines, and emits service_request.published outbox event.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service request published successfully',
    type: ServiceRequestResponseDto,
  })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.serviceRequestsService.publish(id, userId);
    return buildSuccessResponse(
      data,
      'Service request published successfully',
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an open or draft service request',
    description:
      'Cancels the request if no order has been materialized and transitions any open proposals to withdrawn.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service request cancelled successfully',
    type: ServiceRequestResponseDto,
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    const data = await this.serviceRequestsService.cancel(id, userId);
    return buildSuccessResponse(
      data,
      'Service request cancelled successfully',
    );
  }

  @Get(':id/booking-proposals')
  @ApiOperation({
    summary: 'Get all booking proposals for a service request',
    description:
      'Retrieves all proposals created under a service request ordered by revision.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Booking proposals retrieved successfully',
  })
  async findProposals(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUserIdentity,
  ) {
    const data = await this.bookingProposalsService.findByServiceRequestId(
      id,
      user.userId,
      user.roles,
    );
    return buildSuccessResponse(
      data,
      'Booking proposals for service request retrieved successfully',
    );
  }
}
