import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  parentId: string | null;

  @ApiProperty({ example: 'Home Cleaning' })
  name: string;

  @ApiPropertyOptional({
    example: 'Professional home and apartment cleaning services',
    nullable: true,
  })
  description: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/images/cleaning.png',
    nullable: true,
  })
  imageUrl: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({ type: () => [CategoryResponseDto] })
  children?: CategoryResponseDto[];
}
