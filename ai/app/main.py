from contextlib import asynccontextmanager
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

from app.domains.matching.api.matching_ranking import router as matching_ranking_router
from app.domains.matching.api.readiness import router as readiness_router
from app.domains.matching.services.embedding_service import MultilingualE5Service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle management: pre-load the Multilingual E5 embedding model
    once during process startup to prevent request-time latency spikes.
    """
    logger.info("Initializing Multilingual E5 Small embedding model during startup...")
    try:
        MultilingualE5Service.get_instance().load_model()
        logger.info("AI Ranking embedding model successfully pre-loaded into memory.")
    except Exception as exc:
        logger.warning(
            "Could not pre-load embedding model during startup: %s. Model will lazy-load on first rank request.",
            exc,
        )
    yield
    logger.info("Shutting down HandyGo AI Service...")


def create_app() -> FastAPI:
    """
    Khởi tạo và cấu hình ứng dụng FastAPI cho AI Inference Service (Identity & Matching Ranking).
    """

    ensure_storage_dirs()

    application = FastAPI(
        title="HANDY GO — AI Inference Service",
        version=settings.app_version,
        debug=settings.debug,
        description=(
            "AI Inference Microservice cung cấp:\n\n"
            "1. **Identity & eKYC**: Nhận diện OCR CCCD và so khớp khuôn mặt (InsightFace).\n"
            "2. **Matching & Ranking**: Xếp hạng ứng viên bằng mô hình Multilingual E5 Small và thuật toán Hybrid 5 chiều.\n\n"
            "Toàn bộ nghiệp vụ xác minh, orchestration và persistence được quản lý tập trung tại NestJS Backend."
        ),
        openapi_url="/docs-json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
        openapi_tags=[
            {
                "name": "Internal AI Matching & Ranking",
                "description": "Endpoints xếp hạng ứng viên thợ cho NestJS Matching Service",
            },
            {
                "name": "Health & Readiness",
                "description": "Kiểm tra liveness và readiness (kiểm tra model đã nạp vào RAM)",
            },
            {
                "name": "Internal Identity",
                "description": "Endpoints inference nội bộ cho Backend Worker",
            },
            {
                "name": "OCR",
                "description": "Endpoints OCR trích xuất thông tin thẻ",
            },
            {
                "name": "Health",
                "description": "Health check service",
            },
        ],
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health and readiness routers
    application.include_router(health.router)
    application.include_router(readiness_router)

    # Internal inference router (cho Backend Matching Service)
    application.include_router(matching_ranking_router)

    # Internal inference router (cho Backend KYC Worker)
    application.include_router(internal_identity.router)

    # Versioned OCR router
    application.include_router(ocr.router)
    application.include_router(ocr.legacy_router)

    @application.get("/openapi.json", include_in_schema=False)
    def openapi_endpoint():
        return application.openapi()

    register_exception_handlers(application)

    logger.info("HandyGo AI Service initialized successfully")

    return application


app = create_app()


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.getenv("PORT", settings.ai_service_port))

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.debug,
    )

