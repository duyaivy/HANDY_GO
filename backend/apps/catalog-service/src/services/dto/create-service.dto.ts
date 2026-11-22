import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isLessThanBasePriceMax', async: false })
export class IsLessThanBasePriceMaxConstraint
  implements ValidatorConstraintInterface
{
  validate(basePriceMin: any, args: ValidationArguments) {
    const obj = args.object as any;
    if (
      basePriceMin === undefined ||
      basePriceMin === null ||
      obj.basePriceMax === undefined ||
      obj.basePriceMax === null
    ) {
      return true;
    }
    return Number(basePriceMin) < Number(obj.basePriceMax);
  }

  defaultMessage(_args: ValidationArguments) {
    return 'basePriceMin must be strictly less than basePriceMax';
  }
}

@ValidatorConstraint({ name: 'isGreaterThanBasePriceMin', async: false })
export class IsGreaterThanBasePriceMinConstraint
  implements ValidatorConstraintInterface
{
  validate(basePriceMax: any, args: ValidationArguments) {
    const obj = args.object as any;
    if (
      basePriceMax === undefined ||
      basePriceMax === null ||
      obj.basePriceMin === undefined ||
      obj.basePriceMin === null
    ) {
      return true;
    }
    return Number(basePriceMax) > Number(obj.basePriceMin);
  }

  defaultMessage(_args: ValidationArguments) {
    return 'basePriceMax must be strictly greater than basePriceMin';
  }
}

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

  @ApiPropertyOptional({
    description: 'Baseline minimum reference price for the service in VND',
    example: 150000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'basePriceMin must be a number' })
  @Min(0, { message: 'basePriceMin must be non-negative' })
  @Validate(IsLessThanBasePriceMaxConstraint)
  basePriceMin?: number;

  @ApiPropertyOptional({
    description: 'Baseline maximum reference price for the service in VND',
    example: 400000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'basePriceMax must be a number' })
  @Min(0, { message: 'basePriceMax must be non-negative' })
  @Validate(IsGreaterThanBasePriceMinConstraint)
  basePriceMax?: number;
}
