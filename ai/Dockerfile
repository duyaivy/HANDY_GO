# ==============================================================================
# HandyGo AI Service Dockerfile
# Supports:
#   - FastAPI HTTP Server (Default CMD)
#   - Celery Async Worker (override CMD with celery command)
# ==============================================================================
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AI_SERVICE_PORT=8000

# Install system dependencies required by OpenCV, InsightFace, EasyOCR
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pre-install CPU-only PyTorch and Torchvision
# Prevents EasyOCR from pulling 2.5GB+ CUDA binaries on CPU instances
RUN pip install --upgrade pip \
    && pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install application dependencies
COPY requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# Create non-root user and prepare persistent cache directories for models
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/storage /home/app/.insightface /home/app/.EasyOCR /home/app/.cache/huggingface \
    && chown -R app:app /app /home/app/.insightface /home/app/.EasyOCR /home/app/.cache

# Copy application source
COPY --chown=app:app app ./app

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=5 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT', os.getenv('AI_SERVICE_PORT','8000'))+'/health',timeout=3)"

CMD ["python", "-m", "app.main"]