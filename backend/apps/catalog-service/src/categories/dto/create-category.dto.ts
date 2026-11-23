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
import {
  IsValidSuggestionGroups,
  normalizeSuggestionGroups,
  ServiceSuggestionGroupDto,
  SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
  validateSuggestionGroupsValue,
} from '../../common/dto/suggestion-group.dto.js';

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

  @ApiPropertyOptional({
    description:
      'Default service condition suggestion groups inherited by all services in this category (1..6 groups, or null to clear)',
    type: () => [ServiceSuggestionGroupDto],
    nullable: true,
    example: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) && validateSuggestionGroupsValue(value) === null
      ? normalizeSuggestionGroups(value as ServiceSuggestionGroupDto[])
      : value,
  )
  @IsValidSuggestionGroups()
  suggestionGroups?: ServiceSuggestionGroupDto[] | null;
}
