from __future__ import annotations

import hmac
import json
import re
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.domains.identity.core.config import settings
from app.domains.identity.core.exceptions import AppException, BadRequestException
from app.domains.identity.schemas.identity import IdentityVerificationResponse
from app.domains.identity.services.identity_job_store import identity_job_store
from app.domains.identity.services.rabbitmq_publisher import publish_kyc_event
from app.domains.identity.tasks.identity_tasks import process_identity_job

router = APIRouter(prefix="/api/v1/identity", tags=["Identity"])
legacy_router = APIRouter(prefix="/api/identity", tags=["Identity (Legacy)"], include_in_schema=False)
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

security = HTTPBearer(auto_error=False)


def require_gateway_identity(
    x_internal_secret: Annotated[str | None, Header(alias="x-internal-secret", include_in_schema=False)] = None,
    x_user_id: Annotated[str | None, Header(alias="x-user-id", include_in_schema=False)] = None,
    _token: Annotated[HTTPAuthorizationCredentials | None, Depends(security)] = None,
) -> str:
    expected = settings.internal_service_secret
    if expected and x_internal_secret and hmac.compare_digest(x_internal_secret, expected):
        if not x_user_id:
            raise HTTPException(status_code=401, detail="Authenticated user identity is missing.")
        return x_user_id
    if settings.debug and x_user_id:
        return x_user_id
    raise HTTPException(status_code=403, detail="Request must originate from the authenticated API Gateway.")


def _validate_image(file: UploadFile, field_name: str) -> None:
    if not file.filename:
        raise BadRequestException(f"{field_name} chưa có tên file.")
    if (file.content_type or "").lower() not in ALLOWED_CONTENT_TYPES and Path(file.filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise AppException(
            message=f"{field_name} phải là ảnh JPG, JPEG hoặc PNG.",
            status_code=415,
            data={"errorCode": "UNSUPPORTED_IMAGE_TYPE", "field": field_name},
        )


async def _handle_verify_core(
    user_id: str,
    cccd_image: UploadFile,
    selfie_image: UploadFile,
    authenticated_user_id: str,
) -> dict:
    user_id = user_id.strip()
    if user_id != authenticated_user_id:
        raise HTTPException(status_code=403, detail="User identity does not match the authenticated account.")
    if not user_id or len(user_id) > 128:
        raise HTTPException(status_code=400, detail={"error_code": "INVALID_USER_ID", "message": "user_id không hợp lệ."})

    try:
        _validate_image(cccd_image, "cccd_image")
        _validate_image(selfie_image, "selfie_image")
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        cccd_bytes = await cccd_image.read(max_bytes + 1)
        selfie_bytes = await selfie_image.read(max_bytes + 1)
        if not cccd_bytes or not selfie_bytes:
            raise BadRequestException("Ảnh CCCD và ảnh selfie không được rỗng.")
        if len(cccd_bytes) > max_bytes or len(selfie_bytes) > max_bytes:
            raise BadRequestException("Ảnh vượt quá dung lượng cho phép.")

        job_id = uuid4().hex
        job_dir = Path(settings.identity_job_input_dir).resolve() / job_id
        job_dir.mkdir(parents=True, exist_ok=False)
        try:
            (job_dir / "cccd.bin").write_bytes(cccd_bytes)
            (job_dir / "selfie.bin").write_bytes(selfie_bytes)
            identity_job_store.create(job_id, user_id)
            publish_kyc_event("kyc.pending", {"userId": user_id, "jobId": job_id})
            process_identity_job.delay(job_id, user_id)
            publish_kyc_event("kyc.submitted", {"userId": user_id, "jobId": job_id})
        except Exception:
            import shutil
            shutil.rmtree(job_dir, ignore_errors=True)
            identity_job_store.delete(job_id)
            raise

        return {
            "success": True,
            "message": "Yêu cầu xác minh đã được tiếp nhận.",
            "data": {"jobId": job_id, "status": "queued", "statusUrl": f"/api/v1/identity/jobs/{job_id}"},
        }
    finally:
        await cccd_image.close()
        await selfie_image.close()


@router.post("/verify", status_code=202, summary="Đưa yêu cầu xác minh CCCD vào hàng đợi (tự động theo tài khoản đăng nhập)")
async def verify_identity_current_user(
    cccd_image: Annotated[UploadFile, File(description="Ảnh CCCD mặt trước")],
    selfie_image: Annotated[UploadFile, File(description="Ảnh selfie")],
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> dict:
    return await _handle_verify_core(authenticated_user_id, cccd_image, selfie_image, authenticated_user_id)


@router.post("/{user_id}/verify", status_code=202, summary="Đưa yêu cầu xác minh CCCD vào hàng đợi theo user_id")
async def verify_identity(
    user_id: str,
    cccd_image: Annotated[UploadFile, File(description="Ảnh CCCD mặt trước")],
    selfie_image: Annotated[UploadFile, File(description="Ảnh selfie")],
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> dict:
    return await _handle_verify_core(user_id, cccd_image, selfie_image, authenticated_user_id)


@router.get("/jobs/{job_id}", summary="Kiểm tra trạng thái job xác minh")
async def get_identity_job(
    job_id: str,
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> dict:
    job = identity_job_store.get(job_id)
    if job.get("user_id") != authenticated_user_id:
        raise HTTPException(status_code=404, detail="Không tìm thấy job.")
    return {"success": True, "data": job}


@router.get("/verify/{result_id}", response_model=IdentityVerificationResponse, response_model_exclude_none=True,
            summary="Lấy kết quả OCR và đối chiếu khuôn mặt")
async def get_identity_verification(
    result_id: str,
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> IdentityVerificationResponse:
    from app.domains.identity.services.identity_result_store import identity_result_store, IdentityResultStoreError
    try:
        data = identity_result_store.get(result_id)
        if data.get("user_id") != authenticated_user_id:
            raise HTTPException(status_code=404, detail="Không tìm thấy kết quả định danh.")
        data.pop("_cloudinary", None)
    except IdentityResultStoreError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"error_code": exc.error_code, "message": str(exc)}) from exc
    return IdentityVerificationResponse(success=True, message="Lấy kết quả định danh thành công.", data=data)


# --- Legacy Router Handlers (/api/identity/...) for backward compatibility ---
@legacy_router.post("/verify", status_code=202)
async def legacy_verify_identity_current_user(
    cccd_image: Annotated[UploadFile, File()],
    selfie_image: Annotated[UploadFile, File()],
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> dict:
    return await _handle_verify_core(authenticated_user_id, cccd_image, selfie_image, authenticated_user_id)


@legacy_router.post("/{user_id}/verify", status_code=202)
async def legacy_verify_identity(
    user_id: str,
    cccd_image: Annotated[UploadFile, File()],
    selfie_image: Annotated[UploadFile, File()],
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> dict:
    return await _handle_verify_core(user_id, cccd_image, selfie_image, authenticated_user_id)


@legacy_router.get("/jobs/{job_id}")
async def legacy_get_identity_job(
    job_id: str,
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> dict:
    return await get_identity_job(job_id, authenticated_user_id)


@legacy_router.get("/verify/{result_id}", response_model=IdentityVerificationResponse, response_model_exclude_none=True)
async def legacy_get_identity_verification(
    result_id: str,
    authenticated_user_id: Annotated[str, Depends(require_gateway_identity)],
) -> IdentityVerificationResponse:
    return await get_identity_verification(result_id, authenticated_user_id)
