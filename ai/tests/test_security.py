import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.domains.identity.core.config import settings

client = TestClient(app)


def test_internal_identity_missing_secret_returns_403(monkeypatch):
    monkeypatch.setattr(settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post("/internal/v1/identity/analyze")
    assert response.status_code == 403
    assert "Missing required internal service secret header" in response.json()["detail"]


def test_internal_identity_wrong_secret_returns_403(monkeypatch):
    monkeypatch.setattr(settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post(
        "/internal/v1/identity/analyze",
        headers={"x-internal-secret": "wrong-secret-value"},
    )
    assert response.status_code == 403
    assert "Invalid internal service secret" in response.json()["detail"]


def test_ocr_endpoint_missing_secret_returns_403(monkeypatch):
    monkeypatch.setattr(settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post("/api/v1/ocr/cccd")
    assert response.status_code == 403


def test_legacy_ocr_endpoint_missing_secret_returns_403(monkeypatch):
    monkeypatch.setattr(settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post("/ocr/cccd")
    assert response.status_code == 403


def test_ocr_endpoint_wrong_secret_returns_403(monkeypatch):
    monkeypatch.setattr(settings, "internal_service_secret", "test-secret-key-12345")
    response = client.post(
        "/api/v1/ocr/cccd",
        headers={"x-internal-secret": "wrong-secret-value"},
    )
    assert response.status_code == 403


def test_missing_server_secret_fails_closed_with_500(monkeypatch):
    monkeypatch.setattr(settings, "internal_service_secret", None)
    response = client.post(
        "/internal/v1/identity/analyze",
        headers={"x-internal-secret": "some-secret"},
    )
    assert response.status_code == 500
    assert "Internal security misconfiguration" in response.json()["detail"]
