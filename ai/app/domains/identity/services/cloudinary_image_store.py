from __future__ import annotations

import io
from typing import Any
from urllib.parse import unquote, urlparse

import cv2
import numpy as np

from app.domains.identity.core.config import settings


class CloudinaryImageStoreError(RuntimeError):
    pass


class CloudinaryImageStore:
    """Upload ảnh identity lên Cloudinary.

    Cloudinary SDK được import lazy để service vẫn có thể khởi động nếu
    dependency/config chưa được cài. Production nên cấu hình CLOUDINARY_URL
    hoặc CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.
    """

    def __init__(self) -> None:
        self._configured = False

    def _configure(self) -> Any:
        try:
            import cloudinary
            import cloudinary.uploader
        except ImportError as exc:
            raise CloudinaryImageStoreError(
                "Thiếu dependency cloudinary. Cài package 'cloudinary'."
            ) from exc

        if not settings.cloudinary_url and not all(
            (
                settings.cloudinary_cloud_name,
                settings.cloudinary_api_key,
                settings.cloudinary_api_secret,
            )
        ):
            raise CloudinaryImageStoreError(
                "Chưa cấu hình Cloudinary. Cần CLOUDINARY_URL hoặc "
                "CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET."
            )

        if settings.cloudinary_url:
            parsed = urlparse(settings.cloudinary_url)
            cloud_name = parsed.hostname
            api_key = parsed.username
            api_secret = unquote(parsed.password or "")
            if not cloud_name or not api_key or not api_secret:
                raise CloudinaryImageStoreError(
                    "CLOUDINARY_URL không hợp lệ. Dùng cloudinary://API_KEY:API_SECRET@CLOUD_NAME."
                )
            cloudinary.config(
                cloud_name=cloud_name,
                api_key=api_key,
                api_secret=api_secret,
                secure=True,
            )
        else:
            cloudinary.config(
                cloud_name=settings.cloudinary_cloud_name,
                api_key=settings.cloudinary_api_key,
                api_secret=settings.cloudinary_api_secret,
                secure=True,
            )
        self._configured = True
        return cloudinary

    def upload_jpeg_bytes(self, data: bytes, *, public_id: str) -> dict[str, str]:
        cloudinary = self._configure()
        try:
            result = cloudinary.uploader.upload(
                io.BytesIO(data),
                resource_type="image",
                type=settings.cloudinary_delivery_type,
                public_id=public_id,
                overwrite=False,
                invalidate=True,
                folder=settings.cloudinary_folder,
            )
        except Exception as exc:
            raise CloudinaryImageStoreError(
                f"Cloudinary upload thất bại: {exc}"
            ) from exc

        secure_url = result.get("secure_url")
        returned_public_id = result.get("public_id")
        if not secure_url or not returned_public_id:
            raise CloudinaryImageStoreError(
                "Cloudinary không trả về secure_url/public_id."
            )
        return {
            "url": str(secure_url),
            "public_id": str(returned_public_id),
        }

    def upload_ndarray_as_jpeg(
        self,
        image: np.ndarray,
        *,
        public_id: str,
        quality: int = 92,
    ) -> dict[str, str]:
        ok, encoded = cv2.imencode(
            ".jpg",
            image,
            [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)],
        )
        if not ok:
            raise CloudinaryImageStoreError(
                "Không thể encode ảnh portrait crop thành JPEG."
            )
        return self.upload_jpeg_bytes(
            encoded.tobytes(),
            public_id=public_id,
        )

    def delete(self, public_id: str) -> None:
        if not public_id:
            return
        cloudinary = self._configure()
        try:
            cloudinary.uploader.destroy(
                public_id,
                resource_type="image",
                type=settings.cloudinary_delivery_type,
                invalidate=True,
            )
        except Exception as exc:
            raise CloudinaryImageStoreError(
                f"Cloudinary delete thất bại: {exc}"
            ) from exc


cloudinary_image_store = CloudinaryImageStore()
