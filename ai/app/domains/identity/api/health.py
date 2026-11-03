from fastapi import APIRouter

from app.domains.identity.core.config import settings
from app.domains.identity.schemas.response import ApiResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=ApiResponse)
def health_check() -> ApiResponse:
    """Liveness probe: Xác nhận process server đang sống."""
    return ApiResponse(
        success=True,
        message="AI Service đang hoạt động",
        data={
            "appName": settings.app_name,
            "version": settings.app_version,
            "status": "healthy",
        },
    )


@router.get("/ready", response_model=ApiResponse)
def readiness_check() -> ApiResponse:
    """Readiness probe: Xác nhận service đã sẵn sàng tiếp nhận traffic."""
    return ApiResponse(
        success=True,
        message="AI Service đã sẵn sàng tiếp nhận yêu cầu",
        data={
            "appName": settings.app_name,
            "version": settings.app_version,
            "status": "ready",
            "modelsBaked": True,
        },
    )
