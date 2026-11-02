import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '@app/common';

export class DeviceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['android', 'ios', 'web'] })
  platform!: string;

  @ApiProperty({ type: String, nullable: true })
  deviceId!: string | null;

  @ApiProperty({ example: 'fcm' })
  provider!: string;

  @ApiProperty({})
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSeenAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class DeviceResponseDtoEnvelope extends ApiResponseDto<DeviceResponseDto> {
  @ApiProperty({ type: DeviceResponseDto })
  declare data: DeviceResponseDto;
}

export class DeactivatedDeviceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: false })
  isActive!: boolean;
}

export class DeactivatedDeviceDtoEnvelope extends ApiResponseDto<DeactivatedDeviceDto> {
  @ApiProperty({ type: DeactivatedDeviceDto })
  declare data: DeactivatedDeviceDto;
}
