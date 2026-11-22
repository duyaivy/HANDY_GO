from __future__ import annotations

import logging
from typing import Annotated
from fastapi import APIRouter, Depends

from app.domains.matching.core.security import verify_matching_internal_secret
from app.domains.pricing.schemas.pricing import (
    EstimatePricingRequest,
    EstimatePricingResponse,
)
from app.domains.pricing.services.pricing_engine import PricingEngineService

logger = logging.getLogger("pricing.api")

router = APIRouter(
    prefix="/internal/ai/pricing",
    tags=["Internal AI Pricing"],
)

_pricing_engine: PricingEngineService | None = None


def get_pricing_engine() -> PricingEngineService:
    global _pricing_engine
    if _pricing_engine is None:
        _pricing_engine = PricingEngineService()
    return _pricing_engine


@router.post(
    "/estimate",
    response_model=EstimatePricingResponse,
    summary="Internal AI pricing estimation endpoint",
    description=(
        "Estimates reference price range (VND) for customer booking request "
        "using Multilingual E5 Small semantic embedding matching against benchmark cases."
    ),
    dependencies=[Depends(verify_matching_internal_secret)],
)
async def estimate_price(
    request: EstimatePricingRequest,
    pricing_engine: Annotated[PricingEngineService, Depends(get_pricing_engine)],
) -> EstimatePricingResponse:
    logger.info(
        "Received pricing estimation request for service '%s' (desc len: %d)",
        request.service_name,
        len(request.description or ""),
    )
    return await pricing_engine.estimate_price(
        service_name=request.service_name,
        description=request.description,
        base_price_min=request.base_price_min,
        base_price_max=request.base_price_max,
    )
