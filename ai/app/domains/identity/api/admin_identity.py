from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.domains.identity.core.config import settings
from app.domains.identity.services.cloudinary_image_store import cloudinary_image_store
from app.domains.identity.services.identity_result_store import identity_result_store
from app.domains.identity.services.rabbitmq_publisher import publish_kyc_event

router = APIRouter(prefix="/api/v1/admin/identity", tags=["Identity Admin"])
security = HTTPBearer(auto_error=False)


class ReviewRequest(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


def _require_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)] = None,
    x_admin_key: Annotated[str | None, Header(alias="x-admin-key")] = None,
    x_internal_secret: Annotated[str | None, Header(alias="x-internal-secret", include_in_schema=False)] = None,
    x_user_roles: Annotated[str | None, Header(alias="x-user-roles", include_in_schema=False)] = None,
    x_user_permissions: Annotated[str | None, Header(alias="x-user-permissions", include_in_schema=False)] = None,
) -> None:
    # 1. Trường hợp qua API Gateway (Admin đăng nhập tài khoản có JWT token)
    expected_secret = settings.internal_service_secret
    if expected_secret and x_internal_secret and hmac.compare_digest(x_internal_secret, expected_secret):
        roles = [r.strip().lower() for r in (x_user_roles or "").split(",") if r.strip()]
        perms = [p.strip().lower() for p in (x_user_permissions or "").split(",") if p.strip()]
        if "admin" in roles or "user:manage" in perms:
            return  # Đã xác thực thành công là Admin qua API Gateway

    # 2. Trường hợp dùng ADMIN_API_KEY trực tiếp (Bearer Token hoặc header x-admin-key)
    bearer_token = credentials.credentials if credentials else None
    api_key = bearer_token or x_admin_key
    if settings.admin_api_key and api_key and hmac.compare_digest(api_key, settings.admin_api_key):
        return  # Đã xác thực thành công bằng ADMIN_API_KEY

    # 3. Chế độ Debug
    if settings.debug:
        return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Admin key không hợp lệ hoặc tài khoản không có quyền Admin.",
    )


def _public(data: dict) -> dict:
    data = dict(data)
    data.pop("_cloudinary", None)
    return data


@router.get("/pending", dependencies=[Depends(_require_admin)])
async def list_pending():
    return {"success": True, "data": [_public(item) for item in identity_result_store.list_pending()]}


@router.get("/{result_id}", dependencies=[Depends(_require_admin)])
async def get_for_review(result_id: str):
    return {"success": True, "data": _public(identity_result_store.get(result_id))}


@router.post("/{result_id}/approve", dependencies=[Depends(_require_admin)])
async def approve(result_id: str, body: ReviewRequest | None = None):
    data = identity_result_store.update_review(result_id, "verified")
    if body and body.note:
        data["admin_note"] = body.note
        identity_result_store.save(result_id, data)
    user_id = data.get("user_id") or data.get("userId")
    if user_id:
        publish_kyc_event("kyc.completed", {
            "userId": user_id,
            "resultId": result_id,
            "decision": "approved",
            "note": body.note if body else None,
        })
    return {"success": True, "message": "Đã approve identity verification.", "data": _public(data)}


@router.post("/{result_id}/reject", dependencies=[Depends(_require_admin)])
async def reject(result_id: str, body: ReviewRequest | None = None):
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
    user_id = data.get("user_id") or data.get("userId")
    if user_id:
        publish_kyc_event("kyc.failed", {
            "userId": user_id,
            "resultId": result_id,
            "decision": "rejected",
            "reason": body.note if body and body.note else "Admin từ chối xác minh hồ sơ KYC.",
        })
    return {"success": True, "message": "Đã reject identity verification.", "data": _public(data)}
