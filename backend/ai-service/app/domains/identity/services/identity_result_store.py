from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

IdentityStatus = Literal["pending", "verified", "failed"]


class IdentityResultStoreError(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 500):
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code
        self.details: dict[str, Any] = {}

    def to_data(self) -> dict[str, Any]:
        return {"error_code": self.error_code, **self.details}


class IdentityResultStore:
    """JSON persistence cho identity result; không có TTL/session expiration."""

    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or "storage/identity_results").resolve()

    def save(self, result_id: str, payload: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        now = datetime.now(timezone.utc)
        path = self._path(result_id)
        temporary = path.with_suffix(f".{now.timestamp()}.tmp")
        payload = dict(payload)
        payload.setdefault("review_status", "pending")
        payload.setdefault("reviewed_at", None)
        envelope = {"created_at": now.isoformat(), "data": payload}
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(envelope, file, ensure_ascii=False)
            file.flush()
        temporary.replace(path)

    def get(self, result_id: str) -> dict[str, Any]:
        data = self._read_envelope(result_id)["data"]
        if not isinstance(data, dict):
            raise IdentityResultStoreError("IDENTITY_RESULT_CORRUPTED", "Dữ liệu kết quả định danh bị hỏng.", 500)
        return data

    def list_pending(self) -> list[dict[str, Any]]:
        self.root.mkdir(parents=True, exist_ok=True)
        results: list[dict[str, Any]] = []
        for path in self.root.glob("*.json"):
            try:
                payload = self._read_path(path)
                data = payload["data"]
                if isinstance(data, dict) and data.get("review_status", "pending") == "pending":
                    results.append(data)
            except IdentityResultStoreError:
                continue
        results.sort(key=lambda x: str(x.get("id", "")), reverse=True)
        return results

    def update_review(self, result_id: str, status: IdentityStatus) -> dict[str, Any]:
        envelope = self._read_envelope(result_id)
        data = envelope["data"]
        if not isinstance(data, dict):
            raise IdentityResultStoreError("IDENTITY_RESULT_CORRUPTED", "Dữ liệu kết quả định danh bị hỏng.", 500)
        if data.get("review_status") != "pending":
            raise IdentityResultStoreError("IDENTITY_ALREADY_REVIEWED", "Kết quả này đã được admin xử lý.", 409)
        data["review_status"] = status
        data["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        envelope["data"] = data
        self._write_envelope(self._path(result_id), envelope)
        return data

    def _read_envelope(self, result_id: str) -> dict[str, Any]:
        path = self._path(result_id)
        if not path.is_file():
            raise IdentityResultStoreError("IDENTITY_RESULT_NOT_FOUND", "Không tìm thấy kết quả định danh.", 404)
        try:
            payload = self._read_path(path)
            data = payload.get("data")
            if not isinstance(data, dict):
                raise ValueError("data phải là object")
            return payload
        except IdentityResultStoreError:
            raise
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise IdentityResultStoreError("IDENTITY_RESULT_CORRUPTED", "Dữ liệu kết quả định danh bị hỏng.", 500) from exc

    @staticmethod
    def _read_path(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as file:
            payload = json.load(file)
        if not isinstance(payload, dict):
            raise ValueError("envelope phải là object")
        return payload

    @staticmethod
    def _write_envelope(path: Path, payload: dict[str, Any]) -> None:
        temporary = path.with_suffix(f".{datetime.now(timezone.utc).timestamp()}.tmp")
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False)
            file.flush()
        temporary.replace(path)

    def _path(self, result_id: str) -> Path:
        if not result_id or len(result_id) > 128 or not result_id.replace("-", "").isalnum():
            raise IdentityResultStoreError("INVALID_IDENTITY_RESULT_ID", "id kết quả định danh không hợp lệ.", 400)
        return self.root / f"{result_id}.json"


identity_result_store = IdentityResultStore()
