from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    app_name: str = "CCCD AI Service"
    app_version: str = "Version 14.1.0"
    debug: bool = True

    upload_dir: str = "storage/uploads"
    output_dir: str = "storage/outputs"
    max_upload_size_mb: int = 10

    # Cloudinary - ảnh identity để admin đối sánh sau khi verify.
    cloudinary_url: str | None = None
    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: str | None = None
    cloudinary_folder: str = "identity_verifications"
    # "upload" dễ dùng nhưng URL có thể truy cập trực tiếp. Với dữ liệu
    # production nhạy cảm, dùng "private"/"authenticated" và cấp signed URL
    # qua Admin API.
    cloudinary_delivery_type: str = "upload"
    admin_api_key: str | None = None

    # QR Fast Path - thử đọc QR ngay sau khi vùng thẻ được làm phẳng để xác
    # định chiều trước full-card OCR và bỏ các field OCR đã có nguồn QR.
    # Ngân sách này là mềm: OpenCV không hỗ trợ hủy một lần detect/decode
    # đang chạy giữa chừng.
    qr_fast_path_enabled: bool = True
    qr_decode_budget_ms: float = 120.0
    qr_skip_confirmed_field_ocr: bool = True

    # Face Verification - InsightFace buffalo_l / ArcFace 512-D.
    face_model_name: str = "buffalo_l"
    face_execution_provider: str = "CPUExecutionProvider"
    face_detection_size: int = 640
    face_detection_confidence: float = 0.50
    face_match_threshold: float = 0.50
    face_review_threshold: float = 0.40
    face_max_image_pixels: int = 20_000_000
    # Ảnh CCCD và selfie là dữ liệu nhạy cảm; không lưu mặc định.
    face_save_debug: bool = False
    face_debug_dir: str = "storage/debug/face_verification_api"

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
