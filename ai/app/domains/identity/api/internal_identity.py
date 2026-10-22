from __future__ import annotations

import hmac
import tempfile
from pathlib import Path
from typing import Annotated

import cv2
from fastapi import APIRouter, File, Header, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from app.domains.identity.core.config import settings
from app.domains.identity.core.logger import logger
from app.domains.identity.modules.face_verification.errors import FaceVerificationError
from app.domains.identity.services.face_verification_pipeline import (
    face_verification_pipeline,
)
from app.domains.identity.services.ocr_pipeline import ocr_pipeline_service
from app.domains.identity.utils.image_validator import (
    INPUT_HARD_DARK_THRESHOLD,
    check_image_quality,
)
from app.domains.identity.utils.ocr_error_detail import build_ocr_error_detail

router = APIRouter(prefix="/internal/v1/identity", tags=["Internal Identity Inference"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _verify_internal_secret(x_internal_secret: str | None) -> None:
    expected = settings.internal_service_secret
    if expected and x_internal_secret:
        if not hmac.compare_digest(x_internal_secret, expected):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid internal service secret.",
            )
        return
    if expected and not settings.debug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing required internal service secret header.",
        )


def _validate_image(file: UploadFile, field_name: str) -> None:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"errorCode": "EMPTY_FILENAME", "message": f"{field_name} không có tên file."},
        )
    ext = Path(file.filename).suffix.lower()
    ct = (file.content_type or "").lower()
    if ct not in ALLOWED_CONTENT_TYPES and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "errorCode": "UNSUPPORTED_IMAGE_TYPE",
                "message": f"{field_name} phải là ảnh JPG, JPEG hoặc PNG.",
            },
        )


@router.post(
    "/analyze",
    summary="Internal OCR và Face Matching trực tiếp cho BE Worker",
    response_description="Kết quả OCR và so khớp khuôn mặt độc lập, không quản lý trạng thái KYC",
)
async def analyze_identity(
    cccd_image: Annotated[UploadFile, File(description="Ảnh mặt trước CCCD")],
    selfie_image: Annotated[UploadFile, File(description="Ảnh selfie chân dung")],
    x_internal_secret: Annotated[
        str | None,
        Header(alias="x-internal-secret", include_in_schema=False),
    ] = None,
) -> dict:
    _verify_internal_secret(x_internal_secret)

    _validate_image(cccd_image, "cccd_image")
    _validate_image(selfie_image, "selfie_image")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    try:
        cccd_bytes = await cccd_image.read(max_bytes + 1)
        selfie_bytes = await selfie_image.read(max_bytes + 1)

        if not cccd_bytes or not selfie_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"errorCode": "EMPTY_FILE", "message": "Ảnh CCCD và ảnh selfie không được để trống."},
            )

        if len(cccd_bytes) > max_bytes or len(selfie_bytes) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "errorCode": "FILE_TOO_LARGE",
                    "message": f"Dung lượng ảnh vượt quá giới hạn cho phép ({settings.max_upload_size_mb}MB).",
                },
            )

        with tempfile.TemporaryDirectory(prefix="internal_identity_") as temp_dir:
            temp_root = Path(temp_dir)
            cccd_path = temp_root / "cccd_input.jpg"
            cccd_path.write_bytes(cccd_bytes)

            img = cv2.imread(str(cccd_path))
            if img is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"errorCode": "INVALID_IMAGE_DATA", "message": "Không thể giải mã dữ liệu ảnh CCCD."},
                )

            # 1. Kiểm tra chất lượng ảnh đầu vào
            quality = check_image_quality(
                img,
                blur_threshold=0.0,
                dark_threshold=INPUT_HARD_DARK_THRESHOLD,
            )
            if not quality["is_valid"]:
                return {
                    "success": False,
                    "errorCode": quality.get("error_code") or "IMAGE_QUALITY_LOW",
                    "message": quality.get("reason") or "Ảnh CCCD không đủ chất lượng để nhận diện.",
                    "stage": "INPUT_QUALITY",
                }

            # 2. Xử lý OCR thẻ CCCD
            ocr_result = ocr_pipeline_service.process_cccd_image(
                cccd_path,
                temp_root / "ocr_workspace",
            )
            if ocr_result.get("status") == "OCR_FAILED":
                err_detail = build_ocr_error_detail(ocr_result)
                return {
                    "success": False,
                    "errorCode": "OCR_FAILED",
                    "message": err_detail.get("message") or "Không thể trích xuất thông tin OCR từ CCCD.",
                    "details": err_detail,
                }

            cccd_data = ocr_result.get("cccdData") or {}

            # 3. Lấy ảnh chân dung cắt từ thẻ CCCD
            portrait = ocr_result.get("portrait")
            portrait_value = None
            if isinstance(portrait, dict):
                portrait_value = portrait.get("rawImagePath") or portrait.get("imagePath")

            if not portrait_value or not Path(str(portrait_value)).is_file():
                return {
                    "success": True,
                    "data": {
                        "ocr": cccd_data,
                        "faceVerification": {
                            "isMatch": False,
                            "similarity": 0.0,
                            "status": "failed",
                            "needsReview": True,
                            "errorCode": "OCR_PORTRAIT_NOT_FOUND",
                            "message": "Không thể cắt được ảnh chân dung từ CCCD để đối chiếu.",
                        },
                    },
                }

            # 4. Đối chiếu khuôn mặt với ảnh selfie
            try:
                face_output = face_verification_pipeline.process_from_ocr_paths(
                    card_image_path=cccd_path,
                    portrait_image_path=Path(str(portrait_value)),
                    selfie_image_bytes=selfie_bytes,
                    require_portrait=True,
                )
                face_dict = face_output.verification.to_dict()

                return {
                    "success": True,
                    "data": {
                        "ocr": cccd_data,
                        "faceVerification": {
                            "isMatch": bool(face_dict.get("is_match")),
                            "similarity": float(face_dict.get("similarity") or 0.0),
                            "confidence": float(face_dict.get("confidence") or face_dict.get("similarity") or 0.0),
                            "status": str(face_dict.get("status") or "review"),
                            "needsReview": bool(face_dict.get("needs_review")),
                            "qualityAdjusted": bool(face_dict.get("quality_adjusted")),
                            "message": face_output._build_message(),
                        },
                    },
                }
            except FaceVerificationError as exc:
                logger.warning(
                    "Face verification non-match or error: error_code=%s, message=%s",
                    exc.error_code,
                    str(exc),
                )
                return {
                    "success": True,
                    "data": {
                        "ocr": cccd_data,
                        "faceVerification": {
                            "isMatch": False,
                            "similarity": float(getattr(exc, "similarity", 0.0) or 0.0),
                            "status": "mismatch",
                            "needsReview": True,
                            "errorCode": exc.error_code,
                            "message": str(exc),
                        },
                    },
                }

    finally:
        await cccd_image.close()
        await selfie_image.close()
