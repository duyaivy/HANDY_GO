import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateServiceOfferingDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Trạng thái hoạt động của dịch vụ (true = đang bật, false = tạm dừng). Nếu bỏ trống, hệ thống sẽ tự động đảo trạng thái.',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là giá trị boolean (true/false)' })
  isActive?: boolean;
}
