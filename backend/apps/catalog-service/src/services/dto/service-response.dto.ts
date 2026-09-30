import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceCategorySummaryDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Appliances' })
  name: string;

  @ApiPropertyOptional({
    example: 'https://example.com/images/appliances.png',
    nullable: true,
  })
  imageUrl: string | null;
}

export class ServiceResponseDto {
  @ApiProperty({ example: '987e6543-e21b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  categoryId: string;

  @ApiProperty({ example: 'Air Conditioner Repair' })
  name: string;

  @ApiPropertyOptional({
    example: 'Inspection, cleaning, and repair of AC units',
    nullable: true,
  })
  description: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/icons/ac-repair.svg',
    nullable: true,
  })
  iconUrl: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({ type: () => ServiceCategorySummaryDto })
  category?: ServiceCategorySummaryDto;
}
