from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from app.domains.identity.api import (
    admin_identity,
    health,
    identity,
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
    Khởi tạo và cấu hình ứng dụng FastAPI.
    """

    ensure_storage_dirs()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        description=(
            "AI Service xử lý CCCD gồm Card Detection, OCR và "
            "Face Verification.\n\n"
            "Luồng xác minh mới nhận CCCD và selfie trong một request."
        ),
        openapi_tags=[
            {
                "name": "Face Verification"
            }
        ],
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health.router)
    application.include_router(identity.router)
    application.include_router(admin_identity.router)


    register_exception_handlers(application)

    logger.info(
        "CCCD AI Service started successfully"
    )

    return application


app = create_app()
