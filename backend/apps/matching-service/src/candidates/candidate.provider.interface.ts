import type {
  WorkerCandidateDto,
  WorkerMatchProfileDto,
} from './candidate.dto.js';

export const CANDIDATE_PROVIDER = 'CANDIDATE_PROVIDER';

export interface ICandidateProvider {
  findCandidates(
    params: {
      serviceId: string;
      latitude: number;
      longitude: number;
      customerUserId?: string;
    },
    signal?: AbortSignal,
  ): Promise<WorkerCandidateDto[]>;

  getWorkerMatchProfile(
    workerUserId: string,
  ): Promise<WorkerMatchProfileDto | null>;
}
