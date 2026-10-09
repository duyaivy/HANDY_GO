from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.domains.identity.core.config import settings
from app.domains.identity.services.cloudinary_image_store import cloudinary_image_store
from app.domains.identity.services.identity_result_store import identity_result_store

router = APIRouter(prefix="/api/admin/identity", tags=["Identity Admin"])


class ReviewRequest(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


def _require_admin(x_admin_key: Annotated[str | None, Header()] = None) -> None:
    if not settings.admin_api_key:
        raise HTTPException(status_code=503, detail="ADMIN_API_KEY chưa được cấu hình.")
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin key không hợp lệ.")


def _public(data: dict) -> dict:
    data = dict(data)
    data.pop("_cloudinary", None)
    return data


@router.get("/pending")
async def list_pending(x_admin_key: Annotated[str | None, Header()] = None):
    _require_admin(x_admin_key)
    return {"success": True, "data": [_public(item) for item in identity_result_store.list_pending()]}


@router.get("/{result_id}")
async def get_for_review(result_id: str, x_admin_key: Annotated[str | None, Header()] = None):
    _require_admin(x_admin_key)
    return {"success": True, "data": _public(identity_result_store.get(result_id))}


@router.post("/{result_id}/approve")
async def approve(result_id: str, body: ReviewRequest | None = None, x_admin_key: Annotated[str | None, Header()] = None):
    _require_admin(x_admin_key)
    data = identity_result_store.update_review(result_id, "verified")
    if body and body.note:
        data["admin_note"] = body.note
        identity_result_store.save(result_id, data)
    return {"success": True, "message": "Đã approve identity verification.", "data": _public(data)}


@router.post("/{result_id}/reject")
async def reject(result_id: str, body: ReviewRequest | None = None, x_admin_key: Annotated[str | None, Header()] = None):
    _require_admin(x_admin_key)
    data = identity_result_store.update_review(result_id, "failed")
    if body and body.note:
        data["admin_note"] = body.note
    cloudinary_meta = data.get("_cloudinary") or {}
    for key in ("selfie_public_id", "portrait_public_id"):
        public_id = cloudinary_meta.get(key)
        if public_id:
            try:
                cloudinary_image_store.delete(public_id)
            except Exception:
                # Giữ JSON để audit; cleanup Cloudinary có thể retry bằng job riêng.
                pass
    if body and body.note:
        identity_result_store.save(result_id, data)
    return {"success": True, "message": "Đã reject identity verification.", "data": _public(data)}
