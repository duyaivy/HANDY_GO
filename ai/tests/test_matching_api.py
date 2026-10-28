import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.domains.matching.core.config import matching_settings


@pytest.fixture
def auth_headers():
    secret = matching_settings.internal_service_secret or "handy-go-internal-service-secret-key-12345"
    return {"x-internal-secret": secret}


@pytest.mark.asyncio
async def test_health_and_readiness_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Liveness check
        health_resp = await client.get("/health")
        assert health_resp.status_code == 200
        health_data = health_resp.json()
        assert health_data["success"] is True

        # Readiness check
        ready_resp = await client.get("/ready")
        assert ready_resp.status_code == 200
        ready_data = ready_resp.json()
        assert ready_data["status"] == "ready"
        assert ready_data["modelLoaded"] is True
        assert ready_data["embeddingDimension"] == 384


@pytest.mark.asyncio
async def test_auth_rejection_on_invalid_secret():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "serviceRequestId": "req-001",
            "requestRevision": 1,
            "serviceId": "srv-elec",
            "requestDescription": "Sửa chập điện",
            "requestLatitude": 10.772,
            "requestLongitude": 106.698,
            "candidates": [],
        }

        # Request with wrong secret must return 403 Forbidden
        resp = await client.post(
            "/internal/ai/matching/rank",
            json=payload,
            headers={"x-internal-secret": "completely-wrong-secret"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rank_endpoint_success(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "serviceRequestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
            "requestRevision": 1,
            "serviceId": "srv-ac-1234",
            "requestDescription": "Máy lạnh không lạnh và chảy nước nhiều",
            "requestLatitude": 10.772,
            "requestLongitude": 106.698,
            "topN": 20,
            "candidates": [
                {
                    "workerUserId": "w-worker-01",
                    "offeringTitle": "Thợ điện lạnh",
                    "offeringDescription": "Chuyên sửa máy lạnh, vệ sinh bảo trì điều hòa",
                    "distanceKm": 1.5,
                    "radiusKm": 10.0,
                    "averageRating": 4.9,
                    "ratingCount": 45,
                    "experienceYears": 6,
                    "historicalCompletionRate": 0.98,
                },
                {
                    "workerUserId": "w-worker-02",
                    "offeringTitle": "Thợ điện dân dụng",
                    "offeringDescription": "Sửa đường dây điện, aptomat",
                    "distanceKm": 2.5,
                    "radiusKm": 10.0,
                    "averageRating": 4.5,
                    "ratingCount": 10,
                    "experienceYears": 3,
                    "historicalCompletionRate": 0.90,
                },
            ],
        }

        resp = await client.post(
            "/internal/ai/matching/rank",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["providerType"] == "real_ai"
        assert "multilingual-e5-small" in data["modelVersion"]
        assert len(data["rankedWorkers"]) == 2

        # Invariant checks
        ranks = [w["rank"] for w in data["rankedWorkers"]]
        assert ranks == [1, 2]

        for w in data["rankedWorkers"]:
            assert 0.0 <= w["matchingScore"] <= 100.0
            breakdown = w["scoreBreakdown"]
            assert 0.0 <= breakdown["semanticScore"] <= 100.0
            assert 0.0 <= breakdown["geoScore"] <= 100.0
            assert 0.0 <= breakdown["ratingScore"] <= 100.0
            assert 0.0 <= breakdown["experienceScore"] <= 100.0
            assert 0.0 <= breakdown["completionScore"] <= 100.0


@pytest.mark.asyncio
async def test_rank_endpoint_zero_candidates(auth_headers):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "serviceRequestId": "req-zero-001",
            "requestRevision": 1,
            "serviceId": "srv-ac",
            "requestDescription": "Sửa máy lạnh",
            "requestLatitude": 10.772,
            "requestLongitude": 106.698,
            "candidates": [],
        }

        resp = await client.post(
            "/internal/ai/matching/rank",
            json=payload,
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["rankedWorkers"] == []
        assert data["providerType"] == "real_ai"
