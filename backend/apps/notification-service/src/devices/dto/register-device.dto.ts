import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ enum: ['android', 'ios'], example: 'android' })
  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';

  @ApiPropertyOptional({
    maxLength: 255,
    description:
      'Stable installation ID. Send on every registration to rotate tokens without creating another device.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  deviceId?: string;

  @ApiProperty({
    maxLength: 4096,
    writeOnly: true,
    description:
      'Opaque FCM token; stored only, never validated with Firebase or returned.',
  })
  @IsString()
  @Length(1, 4096)
  @Matches(/^\S+$/)
  pushToken!: string;
}
