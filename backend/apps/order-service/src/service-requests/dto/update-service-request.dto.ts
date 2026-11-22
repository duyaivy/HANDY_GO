import { OmitType, PartialType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { CreateServiceRequestDto } from './create-service-request.dto.js';

export class UpdateServiceRequestDto extends PartialType(
  OmitType(CreateServiceRequestDto, [
    'aiRefPriceMin',
    'aiRefPriceMax',
  ] as const),
) {
  @Exclude()
  aiRefPriceMin?: never;

  @Exclude()
  aiRefPriceMax?: never;
}

