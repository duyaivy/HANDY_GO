import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({
    description: 'UUID of the service category this service belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'Category ID is required' })
  @IsUUID('4', { message: 'Category ID must be a valid UUID v4' })
  categoryId: string;

  @ApiProperty({
    description: 'Name of the service',
    example: 'Air Conditioner Repair',
    maxLength: 180,
  })
  @IsNotEmpty({ message: 'Service name must not be empty' })
  @IsString({ message: 'Service name must be a string' })
  @MaxLength(180, { message: 'Service name cannot exceed 180 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the service',
    example: 'Inspection, cleaning, and repair of all air conditioner brands',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  description?: string;

  @ApiPropertyOptional({
    description: 'URL of the icon representing the service',
    example: 'https://example.com/icons/ac-repair.svg',
  })
  @IsOptional()
  @IsString({ message: 'Icon URL must be a string' })
  iconUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether the service is active and available on HandyGo',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean = true;
}
