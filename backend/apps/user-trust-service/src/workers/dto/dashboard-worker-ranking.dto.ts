import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { DASHBOARD_MAX_WORKER_CANDIDATES } from '@app/common';

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
  @ArrayMaxSize(DASHBOARD_MAX_WORKER_CANDIDATES)
  @ValidateNested({ each: true })
  @Type(() => DashboardWorkerCandidateDto)
  candidates!: DashboardWorkerCandidateDto[];
}
