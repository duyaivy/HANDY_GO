import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto, buildSuccessResponse } from '@app/common';
import { TrustedGatewayGuard } from '../common/trusted-gateway.guard.js';
import { GatewayUserId } from '../common/gateway-user-id.decorator.js';
import { PreferencesService } from './preferences.service.js';
import { UpdatePreferencesDto } from './dto/update-preferences.dto.js';
import { PreferencesResponseDtoEnvelope } from './dto/preferences-response.dto.js';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(TrustedGatewayGuard)
@ApiResponse({
  status: 400,
  type: ApiErrorResponseDto,
  description: 'Invalid input or empty patch',
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
@Controller('notifications/preferences')
export class PreferencesController {
  constructor(private readonly service: PreferencesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get owned notification preferences',
    description:
      'Unconfigured defaults: push=true, inApp=true, email=false. No database write on GET.',
  })
  @ApiResponse({ status: 200, type: PreferencesResponseDtoEnvelope })
  async get(@GatewayUserId() userId: string) {
    return buildSuccessResponse(
      await this.service.get(userId),
      'Preferences retrieved',
    );
  }

  @Patch()
  @ApiOperation({
    summary: 'Update owned notification channel preferences',
    description:
      'At least one boolean required. Omitted channels retain their values. No mandatory-category policy is defined in v1. Delivery enforcement is deferred.',
  })
  @ApiResponse({ status: 200, type: PreferencesResponseDtoEnvelope })
  async update(
    @GatewayUserId() userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return buildSuccessResponse(
      await this.service.update(userId, dto),
      'Preferences updated',
    );
  }
}
