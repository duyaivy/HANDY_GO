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

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Name of the service category',
    example: 'Home Cleaning',
    maxLength: 150,
  })
  @IsNotEmpty({ message: 'Category name must not be empty' })
  @IsString({ message: 'Category name must be a string' })
  @MaxLength(150, { message: 'Category name cannot exceed 150 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the service category',
    example: 'Professional home and apartment cleaning services',
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  description?: string;

  @ApiPropertyOptional({
    description: 'Image URL representing the category',
    example: 'https://example.com/images/cleaning.png',
  })
  @IsOptional()
  @IsString({ message: 'Image URL must be a string' })
  imageUrl?: string;

  @ApiPropertyOptional({
    description:
      'UUID of the parent category for nested categories; null for top-level',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Parent ID must be a valid UUID v4' })
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Whether the category is active and visible in the system',
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean = true;
}
