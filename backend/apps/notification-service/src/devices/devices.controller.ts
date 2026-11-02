import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto, buildSuccessResponse } from '@app/common';
import { TrustedGatewayGuard } from '../common/trusted-gateway.guard.js';
import { GatewayUserId } from '../common/gateway-user-id.decorator.js';
import { DevicesService } from './devices.service.js';
import { RegisterDeviceDto } from './dto/register-device.dto.js';
import {
  DeviceResponseDtoEnvelope,
  DeactivatedDeviceDtoEnvelope,
} from './dto/devices-response.dto.js';

@ApiTags('Notification Devices')
@ApiBearerAuth()
@UseGuards(TrustedGatewayGuard)
@ApiResponse({
  status: 400,
  type: ApiErrorResponseDto,
  description: 'Invalid input',
})
@ApiResponse({
  status: 401,
  type: ApiErrorResponseDto,
  description: 'Missing or invalid identity/access token',
})
@ApiResponse({
  status: 403,
  type: ApiErrorResponseDto,
  description: 'Untrusted gateway',
})
@ApiResponse({
  status: 503,
  type: ApiErrorResponseDto,
  description: 'Storage unavailable',
})
@Controller('notifications/devices')
export class DevicesController {
  constructor(private readonly service: DevicesService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Register or rotate an Android/iOS device token',
    description:
      'Send deviceId to preserve the device record across token rotation. Without deviceId, deduplication uses pushToken. No delivery or Firebase validation occurs.',
  })
  @ApiResponse({ status: 200, type: DeviceResponseDtoEnvelope })
  @ApiResponse({
    status: 409,
    type: ApiErrorResponseDto,
    description: 'Token already belongs to another user or installation',
  })
  async register(
    @GatewayUserId() userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return buildSuccessResponse(
      await this.service.register(userId, dto),
      'Device registered',
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate one owned device',
    description:
      'Repeated deactivation succeeds. Missing or other-user devices return 404.',
  })
  @ApiResponse({ status: 200, type: DeactivatedDeviceDtoEnvelope })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async deactivate(
    @GatewayUserId() userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return buildSuccessResponse(
      await this.service.deactivate(userId, id),
      'Device deactivated',
    );
  }
}
