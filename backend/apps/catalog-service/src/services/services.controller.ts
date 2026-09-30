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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ServicesService } from './services.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { QueryServiceDto } from './dto/query-service.dto.js';
import { ServiceResponseDto } from './dto/service-response.dto.js';

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new service',
    description:
      'Admin endpoint to register a new service under a specific category',
  })
  @ApiBody({ type: CreateServiceDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Service created successfully',
    type: ServiceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate service name in category',
  })
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get list of services',
    description:
      'Public endpoint to fetch services filtered by category, search keywords, and active status',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of services',
    type: [ServiceResponseDto],
  })
  findAll(@Query() query: QueryServiceDto) {
    return this.servicesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get service detail',
    description:
      'Public/Admin endpoint to fetch detailed information of a service with its parent category',
  })
  @ApiParam({ name: 'id', description: 'Service UUID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service detail',
    type: ServiceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Service not found',
  })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a service',
    description:
      'Admin endpoint to update service information, category assignment, or availability',
  })
  @ApiParam({ name: 'id', description: 'Service UUID', type: String })
  @ApiBody({ type: UpdateServiceDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service updated successfully',
    type: ServiceResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Service or target category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate service name in category',
  })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Enable or disable a service',
    description:
      'Admin endpoint to quickly toggle or set the active status of a service',
  })
  @ApiParam({ name: 'id', description: 'Service UUID', type: String })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Explicit active status. If omitted, toggles current status.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Service status updated' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Service not found',
  })
  toggleStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('isActive') isActive?: boolean,
  ) {
    return this.servicesService.toggleStatus(id, isActive);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete or disable a service',
    description:
      'Admin endpoint to soft-delete (deactivate) or permanently delete (when ?hard=true) a service',
  })
  @ApiParam({ name: 'id', description: 'Service UUID', type: String })
  @ApiQuery({
    name: 'hard',
    required: false,
    type: Boolean,
    description: 'If true, permanently removes the service from DB',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service deleted or deactivated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Service not found',
  })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('hard') hard?: boolean,
  ) {
    return this.servicesService.remove(id, String(hard) === 'true');
  }
}
