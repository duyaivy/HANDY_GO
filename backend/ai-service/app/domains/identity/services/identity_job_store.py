from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from typing import Any
import redis
from app.domains.identity.core.config import settings

import os
import ssl

class IdentityJobStore:
    def __init__(self) -> None:
        url = settings.effective_redis_url or os.getenv("AI_REDIS_URL") or os.getenv("REDIS_URL")
        if not url:
            raise RuntimeError("REDIS_URL hoặc AI_REDIS_URL chưa được cấu hình.")
        kwargs = {
            "decode_responses": True,
            "socket_connect_timeout": 5,
            "socket_timeout": 5,
            "health_check_interval": 30,
        }
        if url.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
        self.client = redis.Redis.from_url(url, **kwargs)
    def _key(self, job_id: str) -> str:
        if not re.fullmatch(r"[a-f0-9]{32}", job_id):
            raise ValueError("job_id không hợp lệ.")
        return f"identity:job:{job_id}"
    def create(self, job_id: str, user_id: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload = {"job_id": job_id, "user_id": user_id, "status": "queued",
                   "created_at": now, "updated_at": now}
        if not self.client.set(self._key(job_id), json.dumps(payload), ex=settings.identity_job_ttl_seconds, nx=True):
            raise RuntimeError("Job đã tồn tại.")
    def update(self, job_id: str, **fields: Any) -> None:
        key = self._key(job_id)
        raw = self.client.get(key)
        if not raw: return
        payload = json.loads(raw)
        payload.update(fields)
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.client.set(key, json.dumps(payload, ensure_ascii=False), ex=settings.identity_job_ttl_seconds)
    def get(self, job_id: str) -> dict[str, Any]:
        raw = self.client.get(self._key(job_id))
        if not raw:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Không tìm thấy job hoặc job đã hết hạn.")
        return json.loads(raw)
    def delete(self, job_id: str) -> None:
        try: self.client.delete(self._key(job_id))
        except Exception: pass

identity_job_store = IdentityJobStore()
