#!/usr/bin/env python3
"""
Script kiểm thử xác thực eKYC trực tiếp với ảnh thật.
Cách sử dụng:
    python backend/scripts/test-ekyc.py --cccd path/to/cccd.jpg --selfie path/to/selfie.jpg
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


def create_multipart_body(fields: dict, files: dict, boundary: str) -> bytes:
    lines = []
    for name, value in fields.items():
        lines.append(f"--{boundary}".encode("utf-8"))
        lines.append(f'Content-Disposition: form-data; name="{name}"'.encode("utf-8"))
        lines.append(b"")
        lines.append(str(value).encode("utf-8"))

    for name, filepath in files.items():
        filename = Path(filepath).name
        mime_type = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "image/png"
        file_bytes = Path(filepath).read_bytes()
        lines.append(f"--{boundary}".encode("utf-8"))
        lines.append(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode("utf-8"))
        lines.append(f"Content-Type: {mime_type}".encode("utf-8"))
        lines.append(b"")
        lines.append(file_bytes)

    lines.append(f"--{boundary}--".encode("utf-8"))
    lines.append(b"")
    return b"\r\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Test eKYC verification with real images")
    parser.add_argument("--cccd", required=True, help="Đường dẫn đến file ảnh CCCD mặt trước (jpg/png)")
    parser.add_argument("--selfie", required=True, help="Đường dẫn đến file ảnh selfie khuôn mặt (jpg/png)")
    parser.add_argument("--user-id", default="test-user-001", help="User ID giả lập để test")
    parser.add_argument("--base-url", default="http://localhost:8000", help="AI Service base URL")
    parser.add_argument("--secret", default="handy-go-internal-service-secret-key-12345", help="Internal Secret Key")
    args = parser.parse_args()

    cccd_path = Path(args.cccd)
    selfie_path = Path(args.selfie)

    if not cccd_path.is_file():
        print(f"❌ Lỗi: File CCCD không tồn tại: {cccd_path}")
        sys.exit(1)
    if not selfie_path.is_file():
        print(f"❌ Lỗi: File Selfie không tồn tại: {selfie_path}")
        sys.exit(1)

    print(f"📤 Đang gửi ảnh xác minh cho user: {args.user_id}")
    print(f"   - CCCD:   {cccd_path.resolve()} ({cccd_path.stat().st_size / 1024:.1f} KB)")
    print(f"   - Selfie: {selfie_path.resolve()} ({selfie_path.stat().st_size / 1024:.1f} KB)")

    boundary = f"----WebKitFormBoundary{os.urandom(8).hex()}"
    body = create_multipart_body(
        fields={},
        files={"card_image": cccd_path, "selfie_image": selfie_path},
        boundary=boundary,
    )

    url = f"{args.base_url.rstrip('/')}/api/v1/identity/{args.user_id}/verify"
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "x-internal-secret": args.secret,
            "x-user-id": args.user_id,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"❌ HTTP Error {e.code}: {err_body}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Kết nối thất bại tới {url}: {e}")
        sys.exit(1)

    job_id = data.get("data", {}).get("jobId") or data.get("jobId")
    if not job_id:
        print("❌ Không nhận được jobId từ phản hồi:", data)
        sys.exit(1)

    print(f"\n✅ Đã tạo Job thành công! Job ID: {job_id}")
    print("⏳ Đang theo dõi tiến trình xử lý (Polling mỗi 3 giây)...")

    job_url = f"{args.base_url.rstrip('/')}/api/v1/identity/jobs/{job_id}"
    job_req = urllib.request.Request(
        job_url,
        headers={"x-internal-secret": args.secret, "x-user-id": args.user_id},
        method="GET",
    )

    start_time = time.time()
    while True:
        try:
            with urllib.request.urlopen(job_req) as resp:
                job_data = json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"⚠️ Lỗi polling: {e}, thử lại sau...")
            time.sleep(3)
            continue

        status = job_data.get("data", {}).get("status") or job_data.get("status")
        elapsed = int(time.time() - start_time)

        if status == "completed":
            print(f"\n🎉 [Hoàn thành sau {elapsed}s] Kết quả xác minh eKYC:")
            result = job_data.get("data", {}).get("result") or job_data
            print(json.dumps(result, indent=2, ensure_ascii=False))
            break
        elif status == "failed":
            print(f"\n❌ [Thất bại sau {elapsed}s] Job thất bại:")
            error = job_data.get("data", {}).get("error") or job_data
            print(json.dumps(error, indent=2, ensure_ascii=False))
            break
        else:
            print(f"   ⏱️ [{elapsed}s] Trạng thái hiện tại: {status}...")
            time.sleep(3)


if __name__ == "__main__":
    main()
