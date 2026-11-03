"""
Script tải trước (bake) toàn bộ weights của EasyOCR, InsightFace và Multilingual E5 vào container image.
Được gọi trong quá trình `docker build` để đảm bảo:
1. Container khi scale-to-zero thức dậy KHÔNG cần kết nối internet tải model.
2. Tốc độ khởi động (Cold-start) giảm xuống mức tối thiểu.
3. Không bị lỗi timeout, đứt mạng hay rate limit từ nguồn tải model.
"""

import sys


def warmup():
    print("=======================================================")
    print("[1/3] Pre-downloading EasyOCR models (Vietnamese + English)...")
    print("=======================================================")
    try:
        import easyocr

        # Tải detector CRAFT và recognizer tiếng Việt, tiếng Anh
        easyocr.Reader(["vi", "en"], gpu=False)
        print(">>> EasyOCR models downloaded successfully.")
    except Exception as exc:
        print(f"FAILED to download EasyOCR models: {exc}", file=sys.stderr)
        sys.exit(1)

    print("=======================================================")
    print("[2/3] Pre-downloading InsightFace models (buffalo_l)...")
    print("=======================================================")
    try:
        from insightface.app import FaceAnalysis

        fa = FaceAnalysis(
            name="buffalo_l",
            allowed_modules=["detection", "recognition", "landmark_3d_68"],
            providers=["CPUExecutionProvider"],
        )
        # Chuẩn bị model với kích thước detection chuẩn 640x640
        fa.prepare(ctx_id=-1, det_size=(640, 640))
        print(">>> InsightFace models downloaded successfully.")
    except Exception as exc:
        print(f"FAILED to download InsightFace models: {exc}", file=sys.stderr)
        sys.exit(1)

    print("=======================================================")
    print("[3/3] Pre-downloading Multilingual E5 model (intfloat/multilingual-e5-small)...")
    print("=======================================================")
    try:
        from sentence_transformers import SentenceTransformer

        SentenceTransformer("intfloat/multilingual-e5-small")
        print(">>> Multilingual E5 model downloaded successfully.")
    except Exception as exc:
        print(f"FAILED to download Multilingual E5 model: {exc}", file=sys.stderr)
        sys.exit(1)

    print("=======================================================")
    print("All AI model weights (EasyOCR + InsightFace + E5) baked into image successfully!")
    print("=======================================================")


if __name__ == "__main__":
    warmup()
