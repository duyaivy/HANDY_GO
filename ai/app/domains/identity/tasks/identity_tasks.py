from __future__ import annotations
import os
import shutil
import ssl
from pathlib import Path
from celery import Celery
from app.domains.identity.core.config import settings
from app.domains.identity.core.logger import logger
from app.domains.identity.services.identity_job_store import identity_job_store
from app.domains.identity.services.rabbitmq_publisher import publish_kyc_event

redis_url = settings.effective_redis_url or os.getenv("AI_REDIS_URL") or os.getenv("REDIS_URL") or "redis://localhost:6379"

celery_app = Celery("ai_identity", broker=redis_url, backend=redis_url)
celery_app.conf.update(
    task_serializer="json", result_serializer="json", accept_content=["json"],
    task_track_started=True, task_acks_late=True, worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=False, result_expires=settings.identity_job_ttl_seconds,
    broker_connection_retry_on_startup=True,
)
if redis_url.startswith("rediss://"):
    tls = {"ssl_cert_reqs": ssl.CERT_NONE}
    celery_app.conf.broker_use_ssl = tls
    celery_app.conf.redis_backend_use_ssl = tls


@celery_app.task(name="identity.process_verification", bind=True, max_retries=2)
def process_identity_job(self, job_id: str, user_id: str) -> None:
    job_dir = Path(settings.identity_job_input_dir).resolve() / job_id
    try:
        identity_job_store.update(job_id, status="processing", error=None)
        cccd_path, selfie_path = job_dir / "cccd.bin", job_dir / "selfie.bin"
        if not cccd_path.is_file() or not selfie_path.is_file():
            raise FileNotFoundError("Không tìm thấy ảnh đầu vào của job.")

        from app.domains.identity.services.identity_verification_service import process_identity_verification
        response = process_identity_verification(user_id, cccd_path.read_bytes(), selfie_path.read_bytes())
        data = response.model_dump(mode="json", exclude_none=True)
        res_data = data.get("data") or {}
        result_id = res_data.get("id")

        face_verification = res_data.get("face_verification") or {}
        face_status = face_verification.get("status") # "match", "review", or "not_match"
        similarity = face_verification.get("similarity")

        sim_str = f"{similarity:.2f}" if isinstance(similarity, (int, float)) else str(similarity or "N/A")
        if face_status == "not_match":
            note = f"AI cảnh báo: Khuôn mặt có độ tương đồng thấp ({sim_str}). Chờ Admin xem xét kỹ và quyết định."
        elif face_status == "review":
            note = f"AI đối sánh cần xem xét (độ tương đồng: {sim_str}). Chờ Admin xem xét và quyết định."
        else:
            note = f"AI đối sánh khuôn mặt khớp (độ tương đồng: {sim_str}). Chờ Admin xem xét và phê duyệt."

        identity_job_store.update(job_id, status="completed", result_id=result_id, result=data, error=None)
        publish_kyc_event("kyc.reviewing", {
            "userId": user_id,
            "jobId": job_id,
            "resultId": result_id,
            "status": "completed",
            "aiStatus": face_status,
            "reviewNote": note,
            "ocr": res_data.get("ocr"),
            "faceVerification": face_verification,
        })
        logger.info("Job %s AI comparison completed for user %s (status: %s, note: %s)", job_id, user_id, face_status, note)

    except Exception as exc:
        logger.exception("Identity job failed: %s", job_id)
        error_msg = str(exc)
        error_code = "IDENTITY_JOB_FAILED"
        if hasattr(exc, "detail") and isinstance(exc.detail, dict):
            error_msg = exc.detail.get("message", error_msg)
            error_code = exc.detail.get("error_code", error_code)
        elif hasattr(exc, "message"):
            error_msg = getattr(exc, "message", error_msg)

        error_data = {"message": error_msg, "code": error_code}
        identity_job_store.update(job_id, status="failed", error=error_data)

        publish_kyc_event("kyc.failed", {
            "userId": user_id,
            "jobId": job_id,
            "status": "failed",
            "reason": error_msg,
            "errorCode": error_code,
        })
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
        import gc
        gc.collect()
        try:
            import ctypes
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        except Exception:
            pass
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
