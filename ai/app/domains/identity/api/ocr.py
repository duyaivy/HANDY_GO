from typing import Annotated

import cv2
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.domains.identity.api.internal_identity import _verify_internal_secret
from app.domains.identity.schemas.response import ApiResponse
from app.domains.identity.services.ocr_pipeline import ocr_pipeline_service
from app.domains.identity.utils.file_utils import save_upload_file
from app.domains.identity.utils.image_validator import (
    INPUT_HARD_DARK_THRESHOLD,
    check_image_quality,
)
from app.domains.identity.utils.ocr_error_detail import build_ocr_error_detail


def verify_ocr_secret(
    x_internal_secret: Annotated[
        str | None,
        Header(alias="x-internal-secret", include_in_schema=False),
    ] = None,
) -> None:
    """Xác thực bảo vệ các endpoint OCR, đảm bảo chỉ có internal backend service được gọi."""
    _verify_internal_secret(x_internal_secret)


router = APIRouter(
    prefix="/api/v1/ocr",
    tags=["OCR"],
    dependencies=[Depends(verify_ocr_secret)],
)
legacy_router = APIRouter(
    prefix="/ocr",
    tags=["OCR (Legacy)"],
    include_in_schema=False,
    dependencies=[Depends(verify_ocr_secret)],
)


@router.post("/cccd", response_model=ApiResponse)
@legacy_router.post("/cccd", response_model=ApiResponse)
async def ocr_cccd(file: UploadFile = File(...)) -> ApiResponse:
    # 1. Lưu file ảnh vào hệ thống
    image_path = await save_upload_file(file)

    # 2. Đọc ảnh vừa lưu lên bằng OpenCV
    img = cv2.imread(str(image_path))
    if img is None:
        raise HTTPException(status_code=400, detail="Không thể đọc được file ảnh đầu vào.")

    # 3. Kiểm định chất lượng ảnh
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
                "reason": quality["reason"],
                "image_quality": {
                    "blurScore": quality["blur_score"],
                    "brightnessScore": quality["brightness_score"],
                },
                "suggestion": quality["suggestion"],
            },
        )

    # 4. Vượt qua kiểm duyệt -> Đưa vào luồng xử lý OCR AI
    result = await run_in_threadpool(
        ocr_pipeline_service.process_cccd_image,
        image_path,
    )

    if result.get("status") == "OCR_FAILED":
        raise HTTPException(
            status_code=400,
            detail=build_ocr_error_detail(result),
        )

    return ApiResponse(
        success=True,
        message="OCR CCCD hoàn tất.",
        data=result,
    )
