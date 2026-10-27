import { PartialType } from '@nestjs/swagger';
import { CreateServiceRequestDto } from './create-service-request.dto.js';

export class UpdateServiceRequestDto extends PartialType(
  CreateServiceRequestDto,
) {}
