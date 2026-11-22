import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ORDER_CONSTANTS } from '../../common/constants/order.constants.js';

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
  @MinLength(ORDER_CONSTANTS.MIN_RESOLUTION_NOTE_LENGTH, {
    message: 'Dispute reason must be at least 5 characters long',
  })
  @MaxLength(ORDER_CONSTANTS.MAX_RESOLUTION_NOTE_LENGTH, {
    message: 'Dispute reason must be at most 2000 characters long',
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
  @ArrayMaxSize(ORDER_CONSTANTS.MAX_DISPUTE_EVIDENCE_URLS, {
    message: 'Tối đa 10 bằng chứng cho mỗi lần khiếu nại',
  })
  @MaxLength(ORDER_CONSTANTS.MAX_EVIDENCE_URL_LENGTH, {
    each: true,
    message: 'Mỗi URL bằng chứng không được vượt quá 2048 ký tự',
  })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { each: true, message: 'Mỗi bằng chứng phải là một URL hợp lệ' },
  )
  evidenceUrls?: string[];
}
