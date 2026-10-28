import pytest
import numpy as np

from app.domains.matching.services.embedding_service import MultilingualE5Service


@pytest.mark.asyncio
async def test_embedding_service_singleton_and_readiness():
    service1 = MultilingualE5Service.get_instance()
    service2 = MultilingualE5Service.get_instance()
    assert service1 is service2

    service1.load_model()
    assert service1.is_ready is True
    assert service1.embedding_dimension == 384


def test_text_normalization_preserves_vietnamese():
    service = MultilingualE5Service.get_instance()
    raw = "   Máy lạnh   nhà tôi không   lạnh, bị chảy nước!! \x00\x1f "
    cleaned = service.clean_and_normalize_text(raw)
    assert cleaned == "Máy lạnh nhà tôi không lạnh, bị chảy nước!!"


def test_prefix_formatting():
    service = MultilingualE5Service.get_instance()
    q = service._format_query("Sửa điện")
    assert q == "query: Sửa điện"

    # Does not double-prefix
    q2 = service._format_query("query: Sửa điện")
    assert q2 == "query: Sửa điện"

    p = service._format_passage("Thợ điện dân dụng")
    assert p == "passage: Thợ điện dân dụng"

    p2 = service._format_passage("passage: Thợ điện dân dụng")
    assert p2 == "passage: Thợ điện dân dụng"


@pytest.mark.asyncio
async def test_encode_and_semantic_similarity():
    service = MultilingualE5Service.get_instance()
    service.load_model()

    query = "Máy lạnh không lạnh, chảy nước"
    passages = [
        "Chuyên sửa chữa máy lạnh, vệ sinh điều hòa, khắc phục rò rỉ nước",
        "Dịch vụ khoan giếng và lắp đặt đường ống cấp thoát nước",
        "Cửa hàng bán hoa tươi nghệ thuật và quà lưu niệm",
    ]

    scores = await service.compute_semantic_scores(query, passages)
    assert len(scores) == 3
    for s in scores:
        assert 0.0 <= s <= 100.0

    # AC repair worker must have higher semantic relevance than plumber and florist
    assert scores[0] > scores[1]
    assert scores[0] > scores[2]
    assert scores[1] > scores[2]


@pytest.mark.asyncio
async def test_embedding_cache():
    service = MultilingualE5Service.get_instance()
    service.load_model()

    passage = ["Chuyên sửa máy lạnh inverter uy tín"]
    initial_cache_size = service.cache_size

    embs1 = await service.encode_passages(passage)
    assert service.cache_size >= initial_cache_size + 1

    cache_size_after = service.cache_size
    embs2 = await service.encode_passages(passage)
    # Cache size shouldn't grow for repeated passage
    assert service.cache_size == cache_size_after
    np.testing.assert_array_almost_equal(embs1[0], embs2[0])
