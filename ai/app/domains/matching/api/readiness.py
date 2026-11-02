from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from app.domains.matching.core.config import matching_settings
from app.domains.matching.models.schemas import ReadinessResponse
from app.domains.matching.services.embedding_service import MultilingualE5Service

router = APIRouter(tags=["Health & Readiness"])


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness check for AI Model and inference pipeline",
    description="Verifies that intfloat/multilingual-e5-small is fully initialized in memory and ready to rank.",
)
@router.get(
    "/internal/ai/matching/ready",
    response_model=ReadinessResponse,
    include_in_schema=False,
)
def readiness_check() -> ReadinessResponse:
    embedding_svc = MultilingualE5Service.get_instance()
    is_ready = embedding_svc.is_ready

    if not is_ready:
        # If model has not been triggered yet, attempt synchronous load
        try:
            embedding_svc.load_model()
            is_ready = embedding_svc.is_ready
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"AI Ranking model not ready: {err}",
            )

    return ReadinessResponse(
        status="ready" if is_ready else "loading",
        modelLoaded=is_ready,
        modelName=matching_settings.model_name,
        device=matching_settings.device,
        embeddingDimension=embedding_svc.embedding_dimension,
        cacheSize=embedding_svc.cache_size,
        maxConcurrentInferences=matching_settings.max_concurrent_inferences,
    )
