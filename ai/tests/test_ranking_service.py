import pytest
from app.domains.matching.models.schemas import (
    RankingCandidateInput,
    RankingRequestDto,
)
from app.domains.matching.services.ranking_service import HybridRankingService


@pytest.fixture
def ranking_service():
    return HybridRankingService()


def test_geo_scoring(ranking_service):
    # Within radius
    assert ranking_service.calculate_geo_score(2.0, 10.0) == 80.0
    # Exactly at boundary
    assert ranking_service.calculate_geo_score(10.0, 10.0) == 0.0
    # Outside radius
    assert ranking_service.calculate_geo_score(15.0, 10.0) == 0.0
    # Zero radius
    assert ranking_service.calculate_geo_score(2.0, 0.0) == 0.0


def test_bayesian_rating_scoring(ranking_service):
    # Worker with 0 ratings receives prior mean (4.5), which maps to: (4.5 - 1.0)/4.0 * 100 = 87.5
    score_cold = ranking_service.calculate_rating_score(0.0, 0)
    assert score_cold == 87.5

    # Worker with 50 perfect 5.0 ratings -> smoothed near 5.0 -> near 100.0
    score_top = ranking_service.calculate_rating_score(5.0, 50)
    assert score_top > 95.0

    # Worker with 1 rating of 5.0 has prior pull: (5*4.5 + 5.0) / 6 = 27.5/6 = 4.58 -> score ~ 89.58
    score_one_5 = ranking_service.calculate_rating_score(5.0, 1)
    assert score_top > score_one_5  # Consistent track record beats single 5-star review!


def test_experience_scoring(ranking_service):
    assert ranking_service.calculate_experience_score(0.0) == 0.0
    assert ranking_service.calculate_experience_score(5.0) == 50.0
    assert ranking_service.calculate_experience_score(10.0) == 100.0
    # Capped at 10 years
    assert ranking_service.calculate_experience_score(25.0) == 100.0


def test_resolve_effective_weights(ranking_service):
    # Case A: When completion rate is available
    c_with = [
        RankingCandidateInput(
            workerUserId="w1",
            distanceKm=2.0,
            radiusKm=10.0,
            historicalCompletionRate=0.95,
        )
    ]
    weights_with, is_renorm_with = ranking_service.resolve_effective_weights(c_with)
    assert is_renorm_with is False
    assert weights_with["completion"] == 0.10
    assert pytest.approx(sum(weights_with.values()), 0.001) == 1.0

    # Case B: Globally unavailable completion
    c_without = [
        RankingCandidateInput(
            workerUserId="w1",
            distanceKm=2.0,
            radiusKm=10.0,
            historicalCompletionRate=None,
        )
    ]
    weights_without, is_renorm_without = ranking_service.resolve_effective_weights(c_without)
    assert is_renorm_without is True
    assert weights_without["completion"] == 0.0
    assert pytest.approx(sum(weights_without.values()), 0.001) == 1.0
    # Proportions: 0.30/0.90, 0.25/0.90, 0.20/0.90, 0.15/0.90
    assert pytest.approx(weights_without["semantic"], 0.01) == 0.3333


@pytest.mark.asyncio
async def test_full_ranking_deterministic_and_tie_breaking(ranking_service):
    candidates = [
        RankingCandidateInput(
            workerUserId="w_plumber",
            offeringTitle="Thợ sửa ống nước",
            offeringDescription="Chuyên thông tắc cống, sửa ống nước rò rỉ",
            distanceKm=2.0,
            radiusKm=10.0,
            averageRating=4.8,
            ratingCount=20,
            experienceYears=6.0,
            historicalCompletionRate=0.95,
        ),
        RankingCandidateInput(
            workerUserId="w_ac_master",
            offeringTitle="Chuyên gia máy lạnh",
            offeringDescription="Chuyên sửa máy lạnh, bảo dưỡng điều hòa, xử lý máy lạnh chảy nước",
            distanceKm=3.5,
            radiusKm=10.0,
            averageRating=4.9,
            ratingCount=35,
            experienceYears=8.0,
            historicalCompletionRate=0.98,
        ),
        RankingCandidateInput(
            workerUserId="w_ac_apprentice",
            offeringTitle="Thợ sửa máy lạnh",
            offeringDescription="Sửa chữa điều hòa, nạp gas máy lạnh",
            distanceKm=1.5,
            radiusKm=10.0,
            averageRating=0.0,
            ratingCount=0,
            experienceYears=1.0,
            historicalCompletionRate=None,  # Individual cold-start
        ),
    ]

    req = RankingRequestDto(
        serviceRequestId="req-123",
        requestRevision=1,
        serviceId="srv-ac",
        requestDescription="Máy lạnh phòng ngủ bị chảy nước thành giọt và kêu to",
        requestLatitude=10.772,
        requestLongitude=106.698,
        candidates=candidates,
        topN=20,
    )

    resp1 = await ranking_service.rank(req)
    resp2 = await ranking_service.rank(req)

    # Invariant: Output must be deterministic
    assert len(resp1.rankedWorkers) == 3
    assert [w.workerUserId for w in resp1.rankedWorkers] == [w.workerUserId for w in resp2.rankedWorkers]
    assert [w.matchingScore for w in resp1.rankedWorkers] == [w.matchingScore for w in resp2.rankedWorkers]

    # Invariant: w_ac_master must rank #1 due to strong semantic match, rating, and tenure
    assert resp1.rankedWorkers[0].workerUserId == "w_ac_master"
    assert resp1.rankedWorkers[0].rank == 1

    # Invariant: w_ac_apprentice (cold-start) must receive neutral completion prior (80.0), not 0.0
    apprentice = next(w for w in resp1.rankedWorkers if w.workerUserId == "w_ac_apprentice")
    assert apprentice.scoreBreakdown.completionScore == 80.0
    assert apprentice.scoreBreakdown.ratingScore == 87.5  # Bayesian prior for 0 reviews
