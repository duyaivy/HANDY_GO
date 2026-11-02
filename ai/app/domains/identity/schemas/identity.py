from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class IdentityFaceVerificationResult(BaseModel):
    selfie_image: str
    cropfromCCCD: str
    status: Literal["match", "review", "not_match"]
    is_match: bool
    needs_review: bool
    similarity: float = Field(ge=-1.0, le=1.0)


class IdentityVerificationData(BaseModel):
    id: str
    user_id: str
    ocr: dict[str, Any]
    face_verification: IdentityFaceVerificationResult


class IdentityVerificationResponse(BaseModel):
    success: bool
    message: str
    data: IdentityVerificationData
