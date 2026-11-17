import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class DashboardWorkerCandidateDto {
  @IsUUID('all')
  workerUserId!: string;

  @IsInt()
  @Min(1)
  completedOrderCount!: number;
}

export class DashboardWorkerRankingDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DashboardWorkerCandidateDto)
  candidates!: DashboardWorkerCandidateDto[];
}
