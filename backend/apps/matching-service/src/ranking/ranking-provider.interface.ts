import type { RankingRequestDto, RankingResponseDto } from './ranking.dto.js';

export const RANKING_PROVIDER = 'RANKING_PROVIDER';

export interface IRankingProvider {
  readonly providerType: 'mock' | 'fallback' | 'real_ai';
  readonly modelVersion: string;

  rank(request: RankingRequestDto): Promise<RankingResponseDto>;
}
