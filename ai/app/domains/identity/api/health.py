from fastapi import APIRouter

from app.domains.identity.core.config import settings
from app.domains.identity.schemas.response import ApiResponse


router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=ApiResponse)
def health_check() -> ApiResponse:
    return ApiResponse(
        success=True,
        message="AI Service đang hoạt động",
        data={
            "appName": settings.app_name,
            "version": settings.app_version,
        },
    )
