# GigaTIME Django + Celery backend image.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/ml/scripts

WORKDIR /app

# System dependencies: libpq-dev + gcc for psycopg2, git for VCS-based installs,
# libgl1 + libglib2.0-0 are required by opencv-python-headless, and
# libopenslide0 backs openslide-python for whole-slide (.tif/.svs) streaming.
RUN apt-get update && apt-get install -y \
    libpq-dev gcc git libgl1 libglib2.0-0 libopenslide0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first so the layer is cached across code changes.
COPY requirements.txt .
# Install the CPU-only torch/torchvision wheels first so the large CUDA builds
# are never pulled; the pins in requirements.txt are then already satisfied.
RUN pip install --no-cache-dir torch==2.4.0 torchvision==0.19.0 --index-url https://download.pytorch.org/whl/cu124
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend source.
COPY . .

EXPOSE 8000

CMD ["gunicorn", "gigatime_backend.asgi:application", \
     "-w", "4", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000"]
