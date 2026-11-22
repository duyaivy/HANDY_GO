import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.domains.matching.core.config import matching_settings

client = TestClient(app)


def test_pricing_endpoint_requires_auth(monkeypatch):
    monkeypatch.setattr(matching_settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post(
        "/internal/ai/pricing/estimate",
        json={
            "service_name": "Sửa máy lạnh",
            "description": "Máy lạnh chảy nước",
        },
    )
    assert response.status_code == 403


def test_pricing_endpoint_valid_auth(monkeypatch):
    monkeypatch.setattr(matching_settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post(
        "/internal/ai/pricing/estimate",
        headers={"x-internal-secret": "test-secret-key-12345"},
        json={
            "service_name": "Sửa máy lạnh",
            "description": "Máy lạnh chảy nước ngập sàn nhà",
            "base_price_min": 150000,
            "base_price_max": 450000,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "ai_ref_price_min" in data
    assert "ai_ref_price_max" in data
    assert data["ai_ref_price_min"] < data["ai_ref_price_max"]
    assert data["is_fallback"] is False


def test_pricing_endpoint_fallback(monkeypatch):
    monkeypatch.setattr(matching_settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post(
        "/internal/ai/pricing/estimate",
        headers={"x-internal-secret": "test-secret-key-12345"},
        json={
            "service_name": "Sửa máy lạnh",
            "description": "",
            "base_price_min": 150000,
            "base_price_max": 400000,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["is_fallback"] is True
    assert data["ai_ref_price_min"] == 150000
    assert data["ai_ref_price_max"] == 400000
