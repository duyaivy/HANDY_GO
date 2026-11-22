import pytest
from app.domains.pricing.services.pricing_engine import PricingEngineService


@pytest.mark.asyncio
async def test_pricing_engine_matches_air_conditioner_leak():
    engine = PricingEngineService()
    result = await engine.estimate_price(
        service_name="Sửa máy lạnh",
        description="Máy lạnh bị chảy nước nhỏ giọt ướt hết sàn nhà",
        base_price_min=150000,
        base_price_max=450000,
    )

    assert result.status == "success"
    assert result.is_fallback is False
    assert result.confidence > 0.5
    assert "chảy nước" in result.matched_case.lower() or "nghẹt" in result.matched_case.lower()
    assert result.ai_ref_price_min >= 150000
    assert result.ai_ref_price_max <= 500000
    assert result.ai_ref_price_min < result.ai_ref_price_max
    # Verify clean currency (multiple of 10k or 50k)
    assert result.ai_ref_price_min % 10000 == 0
    assert result.ai_ref_price_max % 10000 == 0


@pytest.mark.asyncio
async def test_pricing_engine_fallback_on_unrelated_or_empty_description():
    engine = PricingEngineService()
    # Empty description
    result_empty = await engine.estimate_price(
        service_name="Sửa máy lạnh",
        description="",
        base_price_min=150000,
        base_price_max=400000,
    )
    assert result_empty.is_fallback is True
    assert result_empty.confidence == 0.0
    assert result_empty.ai_ref_price_min == 150000
    assert result_empty.ai_ref_price_max == 400000

    # Unrelated gibberish description
    result_unrelated = await engine.estimate_price(
        service_name="Sửa máy lạnh",
        description="abc xyz jkl qwe rty",
        base_price_min=150000,
        base_price_max=400000,
    )
    assert result_unrelated.is_fallback is True
    assert result_unrelated.ai_ref_price_min == 150000
    assert result_unrelated.ai_ref_price_max == 400000


@pytest.mark.asyncio
async def test_pricing_engine_unsupported_service_does_not_cross_match():
    # Regression test for [P2][AI-01]: "Sơn nhà" with an AC-like description
    engine = PricingEngineService()
    result = await engine.estimate_price(
        service_name="Sơn nhà",
        description="Máy lạnh bị chảy nước nhỏ giọt ướt hết sàn nhà",
        base_price_min=200000,
        base_price_max=500000,
    )

    assert result.status == "success"
    assert result.is_fallback is True
    assert result.matched_case is None
    assert result.confidence == 0.0
    assert result.ai_ref_price_min == 200000
    assert result.ai_ref_price_max == 500000

