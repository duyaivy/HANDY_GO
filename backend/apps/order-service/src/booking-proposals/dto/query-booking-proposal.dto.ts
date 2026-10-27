import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingProposalStatus } from '@prisma/order-client';

export class QueryBookingProposalDto {
  @ApiPropertyOptional({
    description: 'Filter by service request ID',
  })
  @IsOptional()
  @IsUUID()
  serviceRequestId?: string;

  @ApiPropertyOptional({
    description: 'Filter by worker user ID',
  })
  @IsOptional()
  @IsUUID()
  workerUserId?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer user ID',
  })
  @IsOptional()
  @IsUUID()
  customerUserId?: string;

  @ApiPropertyOptional({
    enum: BookingProposalStatus,
    description: 'Filter by booking proposal status',
  })
  @IsOptional()
  @IsEnum(BookingProposalStatus)
  status?: BookingProposalStatus;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}
