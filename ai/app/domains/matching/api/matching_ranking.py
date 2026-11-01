from __future__ import annotations

import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status

from app.domains.matching.core.config import matching_settings
from app.domains.matching.core.security import verify_matching_internal_secret
from app.domains.matching.models.schemas import (
    RankingRequestDto,
    RankingResponseDto,
)
from app.domains.matching.services.ranking_service import HybridRankingService

logger = logging.getLogger("matching.api")

router = APIRouter(
    prefix="/internal/ai/matching",
    tags=["Internal AI Matching & Ranking"],
)

_ranking_service: HybridRankingService | None = None


def get_ranking_service() -> HybridRankingService:
    global _ranking_service
    if _ranking_service is None:
        _ranking_service = HybridRankingService()
    return _ranking_service


@router.post(
    "/rank",
    response_model=RankingResponseDto,
    summary="Internal AI candidate ranking inference endpoint",
    description=(
        "Executes Multilingual E5 Small semantic embedding and explainable 5-dimension "
        "Hybrid Ranking for customer service requests and eligible worker candidates."
    ),
    dependencies=[Depends(verify_matching_internal_secret)],
)
async def rank_candidates(
    request: RankingRequestDto,
    ranking_service: Annotated[HybridRankingService, Depends(get_ranking_service)],
) -> RankingResponseDto:
    # 1. Payload size protection
    max_candidates = matching_settings.max_candidates_per_request
    if len(request.candidates) > max_candidates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Candidate count ({len(request.candidates)}) exceeds maximum "
                f"allowable limit of {max_candidates} candidates."
            ),
        )

    # 2. Check for duplicate worker IDs in input candidate list
    seen_worker_ids = set()
    for c in request.candidates:
        if c.workerUserId in seen_worker_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate candidate workerUserId detected in request: {c.workerUserId}",
            )
        seen_worker_ids.add(c.workerUserId)

    # 3. Execute hybrid AI ranking inference
    try:
        response = await ranking_service.rank(request)
        return response
    except Exception as exc:
        logger.exception(
            "Ranking inference failed for request %s (rev %d): %s",
            request.serviceRequestId,
            request.requestRevision,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Ranking inference error: {str(exc)}",
        )
