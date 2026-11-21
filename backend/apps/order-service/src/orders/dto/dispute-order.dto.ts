import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export enum DisputeCategory {
  SERVICE_QUALITY = 'service_quality',
  INCOMPLETE_WORK = 'incomplete_work',
  PROPERTY_DAMAGE = 'property_damage',
  PRICE_FRAUD = 'price_fraud',
  ATTITUDE = 'attitude',
  OTHER = 'other',
}

export class DisputeOrderDto {
  @ApiProperty({
    description: 'Detailed reason for opening a dispute',
    example: 'Thợ không đến đúng giờ và làm hỏng thiết bị xung quanh',
  })
  @IsNotEmpty({ message: 'Dispute reason is strictly required' })
  @IsString()
  @MinLength(5, {
    message: 'Dispute reason must be at least 5 characters long',
  })
  reason: string;

  @ApiPropertyOptional({
    description: 'Dispute category',
    enum: DisputeCategory,
    example: DisputeCategory.SERVICE_QUALITY,
  })
  @IsOptional()
  @IsEnum(DisputeCategory)
  category?: DisputeCategory;

  @ApiPropertyOptional({
    description: 'Image or video URLs supporting the dispute',
    type: [String],
    example: ['https://storage.handygo.vn/evidences/dispute_1.jpg'],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true, message: 'Mỗi bằng chứng phải là một URL hợp lệ' })
  evidenceUrls?: string[];
}
