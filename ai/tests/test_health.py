import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "appName" in data["data"]
    assert "version" in data["data"]


def test_openapi_docs():
    response = client.get("/docs-json")
    assert response.status_code == 200
