import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingProposalStatus } from '@prisma/order-client';
import { IsCommaSeparatedEnum } from '../../common/validators/is-comma-separated-enum.validator.js';

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
    description: 'Filter by booking proposal status (single or comma-separated)',
    example: 'proposed,changes_requested',
    enum: BookingProposalStatus,
  })
  @IsOptional()
  @IsString({ message: 'status must be a string' })
  @IsCommaSeparatedEnum(BookingProposalStatus)
  status?: string;

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
