from __future__ import annotations

from pathlib import Path
import tempfile
from uuid import uuid4

import cv2

from app.domains.identity.core.config import settings
from app.domains.identity.core.exceptions import AppException, BadRequestException
from app.domains.identity.modules.face_verification.errors import FaceVerificationError
from app.domains.identity.core.logger import logger
from app.domains.identity.schemas.identity import IdentityVerificationResponse
from app.domains.identity.services.face_verification_pipeline import face_verification_pipeline
from app.domains.identity.services.identity_result_store import identity_result_store
from app.domains.identity.services.cloudinary_image_store import (
    CloudinaryImageStoreError,
    cloudinary_image_store,
)
from app.domains.identity.services.ocr_pipeline import ocr_pipeline_service
from app.domains.identity.utils.image_validator import (
    INPUT_HARD_DARK_THRESHOLD,
    check_image_quality,
)
from app.domains.identity.utils.ocr_error_detail import build_ocr_error_detail
from fastapi import HTTPException, status


def _minimal_face_result(
    face_result: dict[str, object],
    *,
    selfie_url: str,
    portrait_url: str,
) -> dict[str, object]:
    return {
        "selfie_image": selfie_url,
        "cropfromCCCD": portrait_url,
        "status": face_result["status"],
        "is_match": face_result["is_match"],
        "needs_review": face_result["needs_review"],
        "similarity": face_result["similarity"],
    }


def process_identity_verification(
    user_id: str,
    cccd_bytes: bytes,
    selfie_bytes: bytes,
) -> IdentityVerificationResponse:
    """Run the existing synchronous identity pipeline from already-read image bytes.

    This function is intentionally independent of FastAPI UploadFile/request lifecycle,
    so a background worker can call the same business logic later.
    """
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if not cccd_bytes or not selfie_bytes:
        raise BadRequestException("Ảnh CCCD và ảnh selfie không được rỗng.")
    if len(cccd_bytes) > max_bytes or len(selfie_bytes) > max_bytes:
        raise BadRequestException("Ảnh vượt quá dung lượng cho phép.")

    try:
        with tempfile.TemporaryDirectory(prefix="identity_verify_") as temp_dir:
            temp_root = Path(temp_dir)
            cccd_path = temp_root / "cccd_input.jpg"
            cccd_path.write_bytes(cccd_bytes)

            img = cv2.imread(str(cccd_path))
            if img is None:
                raise BadRequestException("Không thể đọc ảnh CCCD.")

            quality = check_image_quality(
                img,
                blur_threshold=0.0,
                dark_threshold=INPUT_HARD_DARK_THRESHOLD,
            )
            if not quality["is_valid"]:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": quality["reason"],
                        "error_code": quality["error_code"],
                        "stage": "INPUT_QUALITY",
                    },
                )

            ocr_result = ocr_pipeline_service.process_cccd_image(
                cccd_path,
                temp_root / "ocr_workspace",
            )
            if ocr_result.get("status") == "OCR_FAILED":
                raise HTTPException(
                    status_code=400,
                    detail=build_ocr_error_detail(ocr_result),
                )

            portrait = ocr_result.get("portrait")
            if not isinstance(portrait, dict):
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error_code": "OCR_PORTRAIT_NOT_CREATED",
                        "message": "OCR không tạo được ảnh chân dung cắt từ CCCD.",
                    },
                )

            portrait_value = portrait.get("rawImagePath") or portrait.get("imagePath")
            if not portrait_value or not Path(str(portrait_value)).is_file():
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error_code": "OCR_PORTRAIT_IMAGE_MISSING",
                        "message": "Ảnh chân dung được OCR cắt từ CCCD không còn tồn tại.",
                    },
                )

            face_output = face_verification_pipeline.process_from_ocr_paths(
                card_image_path=cccd_path,
                portrait_image_path=Path(str(portrait_value)),
                selfie_image_bytes=selfie_bytes,
                require_portrait=True,
            )
            face_dict = face_output.verification.to_dict()

            result_id = uuid4().hex
            portrait_image = cv2.imread(str(portrait_value))
            if portrait_image is None:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error_code": "OCR_PORTRAIT_IMAGE_MISSING",
                        "message": "Không thể đọc ảnh chân dung do OCR tạo.",
                    },
                )
            encoded_ok, encoded_portrait = cv2.imencode(
                ".jpg",
                portrait_image,
                [int(cv2.IMWRITE_JPEG_QUALITY), 92],
            )
            if not encoded_ok:
                raise RuntimeError("Không thể mã hóa ảnh chân dung CCCD.")

            portrait_upload = cloudinary_image_store.upload_jpeg_bytes(
                encoded_portrait.tobytes(),
                public_id=f"{result_id}/crop_cccd",
            )
            try:
                selfie_upload = cloudinary_image_store.upload_jpeg_bytes(
                    selfie_bytes,
                    public_id=f"{result_id}/selfie",
                )
            except Exception:
                cloudinary_image_store.delete(portrait_upload["public_id"])
                raise

        data = {
            "id": result_id,
            "user_id": user_id,
            "ocr": ocr_result.get("cccdData") or {},
            "face_verification": _minimal_face_result(
                face_dict,
                selfie_url=selfie_upload["url"],
                portrait_url=portrait_upload["url"],
            ),
        }
        internal_data = {
            **data,
            "_cloudinary": {
                "selfie_public_id": selfie_upload["public_id"],
                "portrait_public_id": portrait_upload["public_id"],
            },
        }
        identity_result_store.save(result_id, internal_data)

        return IdentityVerificationResponse(
            success=True,
            message="OCR CCCD và đối chiếu khuôn mặt hoàn tất.",
            data=data,
        )

    except (AppException, HTTPException):
        raise
    except FaceVerificationError as exc:
        logger.warning(
            "Face verification rejected | error_code=%s | message=%s",
            exc.error_code,
            str(exc),
        )
        raise AppException(
            message=str(exc),
            status_code=exc.status_code,
            data=exc.to_data(),
        ) from exc
    except CloudinaryImageStoreError as exc:
        logger.exception("Identity image upload failed")
        raise AppException(
            message="Không thể lưu ảnh xác thực lên Cloudinary.",
            status_code=status.HTTP_502_BAD_GATEWAY,
            data={"errorCode": "IDENTITY_IMAGE_STORAGE_FAILED"},
        ) from exc
    except ValueError as exc:
        raise BadRequestException(str(exc)) from exc
    except Exception as exc:
        logger.exception("Identity verification failed")
        raise AppException(
            message="Đã xảy ra lỗi trong quá trình định danh.",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            data={"errorCode": "IDENTITY_VERIFICATION_INTERNAL_ERROR"},
        ) from exc
