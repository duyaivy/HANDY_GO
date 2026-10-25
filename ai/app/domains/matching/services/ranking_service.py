from __future__ import annotations

import logging
import time
from typing import Sequence

from app.domains.matching.core.config import matching_settings
from app.domains.matching.models.schemas import (
    RankingCandidateInput,
    RankingRequestDto,
    RankingResponseDto,
    RankedWorkerOutput,
    RankedWorkerMetadataDto,
    ScoreBreakdownDto,
)
from app.domains.matching.services.embedding_service import MultilingualE5Service

logger = logging.getLogger("matching.ranking_service")


class HybridRankingService:
    """
    Implements the explainable 5-dimension Hybrid AI Ranking algorithm:
    1. Semantic Expertise (30%)
    2. Geographical Suitability (25%)
    3. Customer Rating Quality (20%) - Bayesian smoothed
    4. Service-Specific Experience (15%) - Bounded tenured years
    5. Historical Completion Performance (10%) - Order reliability with cold-start neutral priors
    """

    def __init__(self, embedding_service: MultilingualE5Service | None = None) -> None:
        self.embedding_service = embedding_service or MultilingualE5Service.get_instance()
        self.model_version = f"{matching_settings.model_name}-hybrid-v1.0"

    def calculate_geo_score(self, distance_km: float, radius_km: float) -> float:
        """
        Geographical Suitability:
        S_geo = max(0, min(100, (1 - distanceKm / radiusKm) * 100))
        """
        if radius_km <= 0 or distance_km < 0:
            return 0.0
        ratio = distance_km / radius_km
        if ratio >= 1.0:
            return 0.0
        score = (1.0 - ratio) * 100.0
        return round(max(0.0, min(100.0, score)), 2)

    def calculate_rating_score(self, avg_rating: float, rating_count: int) -> float:
        """
        Customer Rating Quality using Bayesian Average smoothing:
        R_adj = (C * m + avg * n) / (C + n)
        Score = ((R_adj - 1.0) / 4.0) * 100
        """
        prior_mean = matching_settings.rating_prior_mean
        prior_weight = matching_settings.rating_prior_weight

        count = max(0, rating_count)
        avg = max(0.0, min(5.0, avg_rating))

        if count == 0:
            smoothed = prior_mean
        else:
            smoothed = (prior_weight * prior_mean + avg * count) / (prior_weight + count)

        # Scale from [1.0, 5.0] to [0.0, 100.0]
        if smoothed <= 1.0:
            score = 0.0
        elif smoothed >= 5.0:
            score = 100.0
        else:
            score = ((smoothed - 1.0) / 4.0) * 100.0

        return round(score, 2)

    def calculate_experience_score(self, experience_years: float) -> float:
        """
        Service-Specific Experience:
        S_exp = min(100, (years / cap) * 100)
        """
        cap = matching_settings.experience_cap_years
        years = max(0.0, experience_years)
        score = min(100.0, (years / cap) * 100.0)
        return round(score, 2)

    def resolve_effective_weights(
        self,
        candidates: Sequence[RankingCandidateInput],
    ) -> tuple[dict[str, float], bool]:
        """
        Resolves active weights. If completion rate is globally absent across all candidates,
        it excludes the completion dimension and renormalizes the remaining 4 weights.
        """
        has_any_completion = any(c.historicalCompletionRate is not None for c in candidates)

        base_weights = {
            "semantic": matching_settings.weight_semantic,
            "geo": matching_settings.weight_geo,
            "rating": matching_settings.weight_rating,
            "experience": matching_settings.weight_experience,
            "completion": matching_settings.weight_completion,
        }

        if has_any_completion:
            return base_weights, False

        # Completion is globally unavailable -> renormalize remaining 4 weights
        active_sum = (
            base_weights["semantic"]
            + base_weights["geo"]
            + base_weights["rating"]
            + base_weights["experience"]
        )

        effective = {
            "semantic": base_weights["semantic"] / active_sum,
            "geo": base_weights["geo"] / active_sum,
            "rating": base_weights["rating"] / active_sum,
            "experience": base_weights["experience"] / active_sum,
            "completion": 0.0,
        }
        return effective, True

    async def rank(self, request: RankingRequestDto) -> RankingResponseDto:
        start_time = time.perf_counter()
        candidates = request.candidates
        top_n = request.topN or matching_settings.default_top_n

        # Handle simulation controls for chaos / fault injection testing
        if request.simulationOptions:
            opts = request.simulationOptions
            if opts.simulateTimeoutMs:
                import asyncio
                await asyncio.sleep(opts.simulateTimeoutMs / 1000.0)
            if opts.simulateError:
                raise RuntimeError("Simulated AI Ranking Failure from simulationOptions")
            if opts.simulateEmpty:
                return RankingResponseDto(
                    modelVersion=self.model_version,
                    providerType="real_ai",
                    rankedWorkers=[],
                    generatedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                )

        if not candidates:
            return RankingResponseDto(
                modelVersion=self.model_version,
                providerType="real_ai",
                rankedWorkers=[],
                generatedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            )

        # 1. Resolve weights and handle globally missing completion
        effective_weights, is_renormalized = self.resolve_effective_weights(candidates)

        # 2. Compute semantic similarity scores in batch
        passages = [
            f"{c.offeringTitle}: {c.offeringDescription}".strip()
            for c in candidates
        ]
        semantic_scores = await self.embedding_service.compute_semantic_scores(
            request.requestDescription,
            passages,
        )

        # 3. Compute component scores for all candidates
        scored_candidates: list[dict] = []
        has_any_completion = any(c.historicalCompletionRate is not None for c in candidates)

        for i, candidate in enumerate(candidates):
            semantic_score = semantic_scores[i]
            geo_score = self.calculate_geo_score(candidate.distanceKm, candidate.radiusKm)
            rating_score = self.calculate_rating_score(
                candidate.averageRating,
                candidate.ratingCount,
            )
            exp_score = self.calculate_experience_score(candidate.experienceYears)

            # Completion score
            if not has_any_completion:
                completion_score = 0.0
            elif candidate.historicalCompletionRate is not None:
                completion_score = round(candidate.historicalCompletionRate * 100.0, 2)
            else:
                # Individual worker cold-start: neutral prior
                completion_score = matching_settings.cold_start_completion_prior

            # Composite matching score: S = sum(w_i * s_i)
            raw_matching_score = (
                effective_weights["semantic"] * semantic_score
                + effective_weights["geo"] * geo_score
                + effective_weights["rating"] * rating_score
                + effective_weights["experience"] * exp_score
                + effective_weights["completion"] * completion_score
            )
            matching_score = round(max(0.0, min(100.0, raw_matching_score)), 2)

            scored_candidates.append({
                "candidate": candidate,
                "matchingScore": matching_score,
                "semanticScore": semantic_score,
                "geoScore": geo_score,
                "ratingScore": rating_score,
                "experienceScore": exp_score,
                "completionScore": completion_score,
            })

        # 4. Deterministic sort:
        # Primary: matchingScore DESC
        # Secondary: distanceKm ASC
        # Tertiary: workerUserId ASC
        scored_candidates.sort(
            key=lambda item: (
                -item["matchingScore"],
                item["candidate"].distanceKm,
                item["candidate"].workerUserId,
            )
        )

        # 5. Limit to Top N (max 20) and assign sequential ranks 1..N
        limited = scored_candidates[: min(20, top_n)]
        duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        ranked_workers: list[RankedWorkerOutput] = []
        for rank_idx, item in enumerate(limited, start=1):
            ranked_workers.append(
                RankedWorkerOutput(
                    workerUserId=item["candidate"].workerUserId,
                    rank=rank_idx,
                    matchingScore=item["matchingScore"],
                    scoreBreakdown=ScoreBreakdownDto(
                        semanticScore=item["semanticScore"],
                        geoScore=item["geoScore"],
                        ratingScore=item["ratingScore"],
                        experienceScore=item["experienceScore"],
                        completionScore=item["completionScore"],
                    ),
                    metadata=RankedWorkerMetadataDto(
                        isSyntheticSemanticScore=False,
                        renormalizedWeights=is_renormalized,
                        embeddingDimension=self.embedding_service.embedding_dimension,
                        inferenceDurationMs=duration_ms,
                        effectiveWeights=effective_weights,
                    ),
                )
            )

        return RankingResponseDto(
            modelVersion=self.model_version,
            providerType="real_ai",
            rankedWorkers=ranked_workers,
            generatedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
