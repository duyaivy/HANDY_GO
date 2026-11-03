import math
import pytest
from app.domains.matching.models.schemas import (
    RankingCandidateInput,
    RankingRequestDto,
)
from app.domains.matching.services.ranking_service import HybridRankingService


def calculate_dcg(relevance_scores: list[int], k: int = 5) -> float:
    dcg = 0.0
    for i in range(min(k, len(relevance_scores))):
        rel = relevance_scores[i]
        dcg += (2**rel - 1) / math.log2(i + 2)
    return dcg


def calculate_ndcg(actual_rel: list[int], ideal_rel: list[int], k: int = 5) -> float:
    dcg = calculate_dcg(actual_rel, k)
    idcg = calculate_dcg(sorted(ideal_rel, reverse=True), k)
    if idcg == 0.0:
        return 1.0 if dcg == 0.0 else 0.0
    return dcg / idcg


def calculate_mrr(relevance_scores: list[int]) -> float:
    for i, rel in enumerate(relevance_scores):
        if rel >= 2:  # relevant threshold
            return 1.0 / (i + 1)
    return 0.0


def calculate_precision_at_k(relevance_scores: list[int], k: int = 5, threshold: int = 2) -> float:
    top_k = relevance_scores[:k]
    if not top_k:
        return 0.0
    relevant_count = sum(1 for r in top_k if r >= threshold)
    return relevant_count / len(top_k)


# Evaluation benchmark dataset with annotated ground-truth relevance grades (0 to 3)
EVALUATION_DATASET = [
    {
        "category": "Air Conditioner Repair",
        "request": "Máy lạnh nhà tôi không lạnh và bị chảy nước nhỏ giọt xuống sàn, cần thợ kiểm tra gấp.",
        "candidates": [
            {
                "id": "ac_01",
                "title": "Chuyên gia điện lạnh",
                "desc": "Chuyên sửa máy lạnh không lạnh, xử lý chảy nước, nạp gas và vệ sinh điều hòa",
                "dist": 1.8,
                "radius": 10.0,
                "rating": 4.9,
                "count": 52,
                "exp": 7,
                "comp": 0.98,
                "relevance": 3,
            },
            {
                "id": "ac_02",
                "title": "Điện lạnh gia dụng",
                "desc": "Sửa chữa điều hòa, thay thế block máy lạnh, khắc phục quạt dàn nóng kêu to",
                "dist": 2.5,
                "radius": 10.0,
                "rating": 4.8,
                "count": 30,
                "exp": 5,
                "comp": 0.95,
                "relevance": 3,
            },
            {
                "id": "ac_03",
                "title": "Lắp đặt điện lạnh",
                "desc": "Chuyên lắp đặt máy lạnh mới, tháo lắp di dời điều hòa dân dụng",
                "dist": 3.0,
                "radius": 10.0,
                "rating": 4.6,
                "count": 18,
                "exp": 4,
                "comp": 0.92,
                "relevance": 2,
            },
            {
                "id": "ac_04",
                "title": "Sửa chữa dân dụng tổng hợp",
                "desc": "Bảo trì thiết bị điện gia đình, sửa quạt, sửa bàn ủi, điện nước",
                "dist": 2.0,
                "radius": 10.0,
                "rating": 4.3,
                "count": 15,
                "exp": 3,
                "comp": 0.88,
                "relevance": 1,
            },
            {
                "id": "ac_05",
                "title": "Dịch vụ thông nghẹt bồn cầu",
                "desc": "Thông tắc bồn cầu, hút bể phốt, xử lý mùi hôi nhà vệ sinh",
                "dist": 1.0,
                "radius": 10.0,
                "rating": 4.7,
                "count": 40,
                "exp": 8,
                "comp": 0.96,
                "relevance": 0,
            },
        ],
    },
    {
        "category": "Plumbing",
        "request": "Đường ống nước dưới bồn rửa chén bị rò rỉ nước ngấm vào tường.",
        "candidates": [
            {
                "id": "plumb_01",
                "title": "Thợ sửa ống nước chuyên nghiệp",
                "desc": "Xử lý đường ống rò rỉ, bục vỡ ống nước, thay van vòi nước bồn rửa chén",
                "dist": 1.5,
                "radius": 10.0,
                "rating": 4.9,
                "count": 60,
                "exp": 8,
                "comp": 0.99,
                "relevance": 3,
            },
            {
                "id": "plumb_02",
                "title": "Dịch vụ cấp thoát nước",
                "desc": "Thi công đường ống nước ngầm, xử lý chống thấm dột tường nhà",
                "dist": 2.8,
                "radius": 10.0,
                "rating": 4.7,
                "count": 25,
                "exp": 5,
                "comp": 0.93,
                "relevance": 2,
            },
            {
                "id": "plumb_03",
                "title": "Thợ thông tắc bồn rửa và sửa ống nước",
                "desc": "Khắc phục bồn rửa chén rò rỉ, thông tắc bồn rửa chén, thay xi phông",
                "dist": 2.2,
                "radius": 10.0,
                "rating": 4.8,
                "count": 35,
                "exp": 6,
                "comp": 0.96,
                "relevance": 3,
            },
            {
                "id": "plumb_04",
                "title": "Bảo dưỡng sửa chữa tổng hợp",
                "desc": "Bảo trì sửa chữa đồ gỗ, sơn sửa cửa sắt",
                "dist": 2.0,
                "radius": 10.0,
                "rating": 4.4,
                "count": 14,
                "exp": 3,
                "comp": 0.89,
                "relevance": 1,
            },
            {
                "id": "plumb_05",
                "title": "Điện tử gia dụng",
                "desc": "Sửa tivi, sửa amply loa đài và máy giặt",
                "dist": 1.2,
                "radius": 10.0,
                "rating": 4.6,
                "count": 20,
                "exp": 4,
                "comp": 0.90,
                "relevance": 0,
            },
        ],
    },
    {
        "category": "Electrical Repair",
        "request": "Ổ cắm điện trong bếp phát tia lửa điện và nhảy aptomat liên tục.",
        "candidates": [
            {
                "id": "elec_01",
                "title": "Thợ điện khẩn cấp 24/7",
                "desc": "Khắc phục sự cố chập điện, nhảy aptomat, thay ổ cắm công tắc an toàn",
                "dist": 1.2,
                "radius": 10.0,
                "rating": 4.9,
                "count": 48,
                "exp": 6,
                "comp": 0.97,
                "relevance": 3,
            },
            {
                "id": "elec_02",
                "title": "Sửa điện gia dụng tại nhà",
                "desc": "Chuyên xử lý chập cháy điện, rò điện, thay aptomat chống giật",
                "dist": 2.2,
                "radius": 10.0,
                "rating": 4.8,
                "count": 32,
                "exp": 5,
                "comp": 0.95,
                "relevance": 3,
            },
            {
                "id": "elec_03",
                "title": "Thiết kế thi công điện",
                "desc": "Đi dây điện âm tường công trình, lắp đèn chùm trang trí",
                "dist": 3.0,
                "radius": 10.0,
                "rating": 4.6,
                "count": 16,
                "exp": 4,
                "comp": 0.91,
                "relevance": 2,
            },
            {
                "id": "elec_04",
                "title": "Sửa chữa khóa cửa",
                "desc": "Mở khóa, sửa khóa cửa, thay ổ khóa vân tay",
                "dist": 1.5,
                "radius": 10.0,
                "rating": 4.5,
                "count": 15,
                "exp": 4,
                "comp": 0.92,
                "relevance": 0,
            },
            {
                "id": "elec_05",
                "title": "Dịch vụ giặt ủi và vệ sinh",
                "desc": "Giặt ủi sấy khô, giặt nệm rèm cửa",
                "dist": 1.0,
                "radius": 10.0,
                "rating": 4.8,
                "count": 30,
                "exp": 5,
                "comp": 0.95,
                "relevance": 0,
            },
        ],
    },
    {
        "category": "Post-Construction Cleaning",
        "request": "Cần dọn vệ sinh tổng thể căn hộ chung cư sau khi hoàn thiện sửa chữa nhà.",
        "candidates": [
            {
                "id": "clean_01",
                "title": "Vệ sinh công nghiệp",
                "desc": "Chuyên dọn vệ sinh sau xây dựng, tẩy sơn vôi bám sàn, hút bụi toàn diện",
                "dist": 2.0,
                "radius": 10.0,
                "rating": 4.9,
                "count": 55,
                "exp": 6,
                "comp": 0.98,
                "relevance": 3,
            },
            {
                "id": "clean_02",
                "title": "Dịch vụ dọn nhà sau cải tạo",
                "desc": "Lau dọn công trình sau sửa chữa, tẩy vết sơn, chà sàn công nghiệp",
                "dist": 2.4,
                "radius": 10.0,
                "rating": 4.8,
                "count": 42,
                "exp": 5,
                "comp": 0.96,
                "relevance": 3,
            },
            {
                "id": "clean_03",
                "title": "Giúp việc theo giờ",
                "desc": "Lau dọn nhà cửa định kỳ, nấu ăn rửa chén hàng ngày",
                "dist": 1.2,
                "radius": 10.0,
                "rating": 4.7,
                "count": 40,
                "exp": 3,
                "comp": 0.94,
                "relevance": 2,
            },
            {
                "id": "clean_04",
                "title": "Dịch vụ chuyển nhà trọn gói",
                "desc": "Đóng gói đồ đạc bốc xếp và vận chuyển xe tải",
                "dist": 2.8,
                "radius": 10.0,
                "rating": 4.6,
                "count": 22,
                "exp": 4,
                "comp": 0.92,
                "relevance": 1,
            },
            {
                "id": "clean_05",
                "title": "Thợ mộc đóng đồ gỗ",
                "desc": "Đóng tủ bếp, giường ngủ, bàn ghế gỗ tự nhiên",
                "dist": 2.5,
                "radius": 10.0,
                "rating": 4.5,
                "count": 12,
                "exp": 10,
                "comp": 0.90,
                "relevance": 0,
            },
        ],
    },
]


@pytest.mark.asyncio
async def test_quality_evaluation_across_categories():
    service = HybridRankingService()
    ndcg_list = []
    mrr_list = []
    p5_list = []

    for scenario in EVALUATION_DATASET:
        candidates_input = [
            RankingCandidateInput(
                workerUserId=c["id"],
                offeringTitle=c["title"],
                offeringDescription=c["desc"],
                distanceKm=c["dist"],
                radiusKm=c["radius"],
                averageRating=c["rating"],
                ratingCount=c["count"],
                experienceYears=c["exp"],
                historicalCompletionRate=c["comp"],
            )
            for c in scenario["candidates"]
        ]

        req = RankingRequestDto(
            serviceRequestId=f"eval-{scenario['category']}",
            requestRevision=1,
            serviceId="eval-srv",
            requestDescription=scenario["request"],
            requestLatitude=10.772,
            requestLongitude=106.698,
            candidates=candidates_input,
            topN=5,
        )

        res = await service.rank(req)
        ranked_ids = [w.workerUserId for w in res.rankedWorkers]

        id_to_rel = {c["id"]: c["relevance"] for c in scenario["candidates"]}
        actual_rel = [id_to_rel[wid] for wid in ranked_ids]
        ideal_rel = [c["relevance"] for c in scenario["candidates"]]

        ndcg = calculate_ndcg(actual_rel, ideal_rel, k=5)
        mrr = calculate_mrr(actual_rel)
        p3 = calculate_precision_at_k(actual_rel, k=3, threshold=2)
        p5 = calculate_precision_at_k(actual_rel, k=5, threshold=2)

        ndcg_list.append(ndcg)
        mrr_list.append(mrr)
        p5_list.append(p5)

        # Invariant: Semantically matching workers must be ranked ahead of irrelevant trades
        assert actual_rel[0] >= 2, f"Top ranked worker for {scenario['category']} has relevance {actual_rel[0]} < 2"

    mean_ndcg = sum(ndcg_list) / len(ndcg_list)
    mean_mrr = sum(mrr_list) / len(mrr_list)
    mean_p5 = sum(p5_list) / len(p5_list)

    print(f"\n--- EVALUATION METRICS REPORT ---")
    print(f"Mean NDCG@5:     {mean_ndcg:.4f}")
    print(f"Mean MRR:        {mean_mrr:.4f}")
    print(f"Mean Precision@5: {mean_p5:.4f}")

    assert mean_ndcg >= 0.85, f"Mean NDCG@5 ({mean_ndcg}) below acceptance threshold of 0.85"
    assert mean_mrr >= 0.90, f"Mean MRR ({mean_mrr}) below threshold of 0.90"
    assert mean_p5 >= 0.60, f"Mean Precision@5 ({mean_p5}) below threshold of 0.60"
