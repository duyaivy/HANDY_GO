import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GatewayLogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token của phiên cần thu hồi',
    example: 'd8f1e4b2a3c7...',
  })
  @IsOptional()
  @IsString({ message: 'refreshToken phải là chuỗi' })
  refreshToken?: string;
}
