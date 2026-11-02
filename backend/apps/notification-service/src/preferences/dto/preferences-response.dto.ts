import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '@app/common';

export class PreferencesResponseDto {
  @ApiProperty({ default: true })
  pushEnabled!: boolean;

  @ApiProperty({ default: true })
  inAppEnabled!: boolean;

  @ApiProperty({ default: false })
  emailEnabled!: boolean;
}

export class PreferencesResponseDtoEnvelope extends ApiResponseDto<PreferencesResponseDto> {
  @ApiProperty({ type: PreferencesResponseDto })
  declare data: PreferencesResponseDto;
}
