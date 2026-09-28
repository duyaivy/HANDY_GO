from __future__ import annotations

from pathlib import Path
import tempfile

import cv2
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.domains.identity.core.config import settings
from app.domains.identity.core.exceptions import AppException, BadRequestException
from app.domains.identity.services.identity_result_store import IdentityResultStoreError
from app.domains.identity.modules.face_verification.errors import FaceVerificationError
from app.domains.identity.core.logger import logger
from app.domains.identity.schemas.identity import IdentityVerificationResponse
from app.domains.identity.services.face_verification_pipeline import (
    face_verification_pipeline,
)
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


router = APIRouter(prefix="/api/identity", tags=["Identity"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def _validate_image(file: UploadFile, field_name: str) -> None:
    if not file.filename:
        raise BadRequestException(
            f"{field_name} chưa có tên file.",
            data={"errorCode": "MISSING_FILE_NAME", "field": field_name},
        )
    extension = Path(file.filename).suffix.lower()
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES and extension not in ALLOWED_EXTENSIONS:
        raise AppException(
            message=f"{field_name} phải là ảnh JPG, JPEG hoặc PNG.",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            data={"errorCode": "UNSUPPORTED_IMAGE_TYPE", "field": field_name},
        )


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


@router.post(
    "/{user_id}/verify",
    response_model=IdentityVerificationResponse,
    response_model_exclude_none=True,
    summary="OCR CCCD và đối chiếu khuôn mặt trong một request",
)
async def verify_identity(
    user_id: str,
    cccd_image: Annotated[UploadFile, File(description="Ảnh CCCD mặt trước")],
    selfie_image: Annotated[UploadFile, File(description="Ảnh selfie")],
) -> IdentityVerificationResponse:
    """Nhận đúng 2 ảnh một lần cho một user, chạy OCR rồi Face Verification và lưu kết quả."""
    user_id = user_id.strip()
    if not user_id or len(user_id) > 128:
        raise HTTPException(status_code=400, detail={"error_code": "INVALID_USER_ID", "message": "user_id không hợp lệ."})

    try:
        _validate_image(cccd_image, "cccd_image")
        _validate_image(selfie_image, "selfie_image")

        # OCR hiện tại cần một path, nhưng flow verify không được lưu ảnh
        # CCCD/portrait vào storage. Dùng workspace tạm của OS; toàn bộ
        # workspace sẽ bị xóa khi request kết thúc.
        cccd_bytes = await cccd_image.read(
            settings.max_upload_size_mb * 1024 * 1024 + 1
        )
        if not cccd_bytes:
            raise BadRequestException("Ảnh CCCD không được rỗng.")
        if len(cccd_bytes) > settings.max_upload_size_mb * 1024 * 1024:
            raise BadRequestException("Ảnh CCCD vượt quá dung lượng cho phép.")

        selfie_bytes = await selfie_image.read(
            settings.max_upload_size_mb * 1024 * 1024 + 1
        )
        if not selfie_bytes:
            raise BadRequestException("Ảnh selfie không được rỗng.")
        if len(selfie_bytes) > settings.max_upload_size_mb * 1024 * 1024:
            raise BadRequestException("Ảnh selfie vượt quá dung lượng cho phép.")

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

            ocr_result = await run_in_threadpool(
                ocr_pipeline_service.process_cccd_image,
                cccd_path,
                temp_root / "ocr_workspace",
            )
            if ocr_result.get("status") == "OCR_FAILED":
                raise HTTPException(
                    status_code=400,
                    detail=build_ocr_error_detail(ocr_result),
                )

            # Face Verify bắt buộc dùng portrait crop do OCR tạo. Portrait
            # chỉ tồn tại trong workspace tạm và không được ghi vào storage.
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

            face_output = await run_in_threadpool(
                face_verification_pipeline.process_from_ocr_paths,
                card_image_path=cccd_path,
                portrait_image_path=Path(str(portrait_value)),
                selfie_image_bytes=selfie_bytes,
                require_portrait=True,
            )
            face_dict = face_output.verification.to_dict()

            # Chỉ sau khi Face Verify thành công mới đưa hai ảnh cần cho
            # admin lên Cloudinary. Ảnh gốc CCCD không được upload.
            result_id = uuid4().hex
            # Upload đúng portrait crop do OCR tạo và đã được dùng làm
            # reference cho Face Verify, không upload toàn bộ CCCD.
            portrait_upload = await run_in_threadpool(
                cloudinary_image_store.upload_jpeg_bytes,
                cv2.imencode(
                    ".jpg",
                    cv2.imread(str(portrait_value)),
                    [int(cv2.IMWRITE_JPEG_QUALITY), 92],
                )[1].tobytes(),
                public_id=f"{result_id}/crop_cccd",
            )
            try:
                selfie_upload = await run_in_threadpool(
                    cloudinary_image_store.upload_jpeg_bytes,
                    selfie_bytes,
                    public_id=f"{result_id}/selfie",
                )
            except Exception:
                await run_in_threadpool(
                    cloudinary_image_store.delete,
                    portrait_upload["public_id"],
                )
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
        # public_id chỉ là metadata nội bộ để sau này admin approve/reject
        # có thể cleanup Cloudinary; không đưa nó vào response API.
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
    finally:
        await cccd_image.close()
        await selfie_image.close()


@router.get(
    "/verify/{result_id}",
    response_model=IdentityVerificationResponse,
    response_model_exclude_none=True,
    summary="Lấy kết quả OCR và đối chiếu khuôn mặt",
)
async def get_identity_verification(result_id: str) -> IdentityVerificationResponse:
    try:
        data = identity_result_store.get(result_id)
        if isinstance(data, dict):
            data.pop("_cloudinary", None)
    except IdentityResultStoreError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "error_code": exc.error_code,
                "message": str(exc),
            },
        ) from exc

    return IdentityVerificationResponse(
        success=True,
        message="Lấy kết quả định danh thành công.",
        data=data,
    )
