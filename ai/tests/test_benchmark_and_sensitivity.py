import asyncio
import time
import pytest
from scipy.stats import spearmanr

from app.domains.matching.models.schemas import (
    RankingCandidateInput,
    RankingRequestDto,
)
from app.domains.matching.services.ranking_service import HybridRankingService


def generate_synthetic_candidates(count: int) -> list[RankingCandidateInput]:
    trades = [
        ("Thợ sửa máy lạnh", "Chuyên sửa điều hòa không lạnh, chảy nước, nạp gas R32"),
        ("Thợ điện gia dụng", "Khắc phục chập điện, nhảy aptomat, thay dây điện"),
        ("Thợ sửa ống nước", "Thông tắc bồn rửa, sửa van nước rò rỉ, bục vỡ ống"),
        ("Dịch vụ vệ sinh công nghiệp", "Dọn dẹp nhà cửa, hút bụi, chà sàn"),
    ]
    candidates = []
    for i in range(count):
        trade_idx = i % len(trades)
        title, desc = trades[trade_idx]
        candidates.append(
            RankingCandidateInput(
                workerUserId=f"worker-{i:04d}",
                offeringTitle=title,
                offeringDescription=desc,
                distanceKm=round(1.0 + (i % 15) * 0.5, 2),
                radiusKm=10.0,
                averageRating=round(4.0 + (i % 10) * 0.1, 2),
                ratingCount=10 + (i % 50),
                experienceYears=float(1 + (i % 12)),
                historicalCompletionRate=round(0.85 + (i % 15) * 0.01, 2),
            )
        )
    return candidates


@pytest.mark.asyncio
async def test_inference_benchmarks():
    service = HybridRankingService()
    # Warm up: nạp model vào RAM trước để benchmark đo đúng thời gian suy luận
    service.embedding_service.load_model()
    await service.embedding_service.encode_query("khởi động kiểm thử")

    sizes = [5, 20, 100]

    print("\n--- INFERENCE LATENCY & THROUGHPUT BENCHMARK ---")
    for size in sizes:
        candidates = generate_synthetic_candidates(size)
        req = RankingRequestDto(
            serviceRequestId=f"bench-{size}",
            requestRevision=1,
            serviceId="srv-ac",
            requestDescription="Máy lạnh phòng khách bị chảy nước nhiều và không có gió lạnh",
            requestLatitude=10.772,
            requestLongitude=106.698,
            candidates=candidates,
            topN=20,
        )

        start = time.perf_counter()
        res = await service.rank(req)
        elapsed_ms = (time.perf_counter() - start) * 1000.0

        print(
            f"Candidates: {size:3d} | "
            f"Returned: {len(res.rankedWorkers):2d} | "
            f"Total Latency: {elapsed_ms:6.2f} ms | "
            f"Per-candidate: {elapsed_ms / size:5.2f} ms"
        )
        assert len(res.rankedWorkers) == min(20, size)
        assert elapsed_ms < 10000.0  # Must be comfortably within typical HTTP timeouts (10s for shared CI CPU)


@pytest.mark.asyncio
async def test_concurrent_ranking_requests():
    service = HybridRankingService()
    concurrency = 5
    reqs = [
        RankingRequestDto(
            serviceRequestId=f"concurrent-{i}",
            requestRevision=1,
            serviceId="srv-ac",
            requestDescription=f"Cần thợ sửa máy lạnh gấp căn hộ số {i}",
            requestLatitude=10.772,
            requestLongitude=106.698,
            candidates=generate_synthetic_candidates(20),
            topN=20,
        )
        for i in range(concurrency)
    ]

    start = time.perf_counter()
    responses = await asyncio.gather(*(service.rank(r) for r in reqs))
    total_elapsed = (time.perf_counter() - start) * 1000.0

    print(
        f"\nConcurrent Requests: {concurrency} | "
        f"Total Wall Time: {total_elapsed:.2f} ms | "
        f"Avg Latency: {total_elapsed / concurrency:.2f} ms/req"
    )

    assert len(responses) == concurrency
    for res in responses:
        assert len(res.rankedWorkers) == 20


@pytest.mark.asyncio
async def test_weight_sensitivity_analysis():
    """
    Evaluates sensitivity of ranking order to changes in feature weighting profiles.
    Compares Baseline against:
    1. Hyper-Local Profile: Geo (40%), Semantic (25%), Rating (15%), Experience (10%), Completion (10%)
    2. High-Trust Profile: Rating (30%), Semantic (35%), Experience (15%), Geo (15%), Completion (5%)
    Computes Spearman's rank correlation coefficient (rho).
    """
    service = HybridRankingService()
    candidates = generate_synthetic_candidates(20)

    req = RankingRequestDto(
        serviceRequestId="sensitivity-req",
        requestRevision=1,
        serviceId="srv-ac",
        requestDescription="Cần thợ kiểm tra máy lạnh chảy nước và nạp gas",
        requestLatitude=10.772,
        requestLongitude=106.698,
        candidates=candidates,
        topN=20,
    )

    baseline_res = await service.rank(req)
    baseline_order = [w.workerUserId for w in baseline_res.rankedWorkers]

    # Custom scoring simulator with alternative weights
    def score_with_weights(weights: dict[str, float]) -> list[str]:
        scored = []
        for w in baseline_res.rankedWorkers:
            bk = w.scoreBreakdown
            score = (
                weights["semantic"] * bk.semanticScore
                + weights["geo"] * bk.geoScore
                + weights["rating"] * bk.ratingScore
                + weights["experience"] * bk.experienceScore
                + weights["completion"] * bk.completionScore
            )
            scored.append((w.workerUserId, score))
        scored.sort(key=lambda x: -x[1])
        return [x[0] for x in scored]

    hyper_local_weights = {"semantic": 0.25, "geo": 0.40, "rating": 0.15, "experience": 0.10, "completion": 0.10}
    high_trust_weights = {"semantic": 0.35, "geo": 0.15, "rating": 0.30, "experience": 0.15, "completion": 0.05}

    hl_order = score_with_weights(hyper_local_weights)
    ht_order = score_with_weights(high_trust_weights)

    # Compute Spearman rank correlations
    baseline_ranks = {wid: r for r, wid in enumerate(baseline_order)}
    hl_ranks_aligned = [baseline_ranks[wid] for wid in hl_order]
    ht_ranks_aligned = [baseline_ranks[wid] for wid in ht_order]

    rho_hl, _ = spearmanr(list(range(len(baseline_order))), hl_ranks_aligned)
    rho_ht, _ = spearmanr(list(range(len(baseline_order))), ht_ranks_aligned)

    print("\n--- WEIGHT SENSITIVITY ANALYSIS REPORT ---")
    print(f"Spearman rho (Baseline vs Hyper-Local): {rho_hl:.4f}")
    print(f"Spearman rho (Baseline vs High-Trust):   {rho_ht:.4f}")

    # Stability threshold: rho >= 0.70 as defined in WEIGHTING_DECISION_RECORD.md
    assert rho_hl >= 0.70, f"Hyper-local rank correlation ({rho_hl}) is too unstable"
    assert rho_ht >= 0.70, f"High-trust rank correlation ({rho_ht}) is too unstable"
