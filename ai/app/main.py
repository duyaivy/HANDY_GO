from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from app.domains.identity.api import (
    health,
    internal_identity,
    ocr,
)
from app.domains.identity.core.config import settings
from app.domains.identity.core.exception_handlers import (
    register_exception_handlers,
)
from app.domains.identity.core.logger import logger
from app.domains.identity.utils.file_utils import ensure_storage_dirs


def create_app() -> FastAPI:
    """
    Khởi tạo và cấu hình ứng dụng FastAPI cho AI Inference Service.
    """

    ensure_storage_dirs()

    application = FastAPI(
        title="HANDY GO — AI Identity Inference Service",
        version=settings.app_version,
        debug=settings.debug,
        description=(
            "AI Service cung cấp API inference trích xuất OCR CCCD và so khớp khuôn mặt.\n\n"
            "Nghiệp vụ xác minh và quản lý trạng thái KYC được quản lý tập trung tại Backend."
        ),
        openapi_url="/docs-json",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_tags=[
            {"name": "Internal Identity", "description": "Endpoints inference nội bộ cho Backend Worker"},
            {"name": "OCR", "description": "Endpoints OCR trích xuất thông tin thẻ"},
            {"name": "Health", "description": "Health check service"},
        ],
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health router
    application.include_router(health.router)

    # Internal inference router (cho Backend KYC Worker)
    application.include_router(internal_identity.router)

    # Versioned OCR router
    application.include_router(ocr.router)
    application.include_router(ocr.legacy_router)

    @application.get("/openapi.json", include_in_schema=False)
    def openapi_endpoint():
        return application.openapi()

    register_exception_handlers(application)

    logger.info("CCCD AI Service started successfully")

    return application


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.ai_service_port,
        reload=settings.debug,
    )

