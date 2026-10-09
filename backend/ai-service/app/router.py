from fastapi import APIRouter

from app.domains.identity.api import health, ocr

router = APIRouter()
router.include_router(health.router)
router.include_router(ocr.router)

__all__ = ["router"]
