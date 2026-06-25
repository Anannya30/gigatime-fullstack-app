# GigaTIME Django + Celery backend image.
#
# IMPORTANT: this Dockerfile is built with the BUILD CONTEXT set to the REPO ROOT
# (not backend/), so it can copy BOTH the Django backend AND the ML inference
# scripts that live OUTSIDE backend/ at ml/scripts/. tasks.py does
# `from run_png_inference import ...` after putting REPO_ROOT/ml/scripts on
# sys.path (== /app/ml/scripts here), so those files MUST be in the image —
# previously they weren't, causing `ModuleNotFoundError: No module named
# 'run_png_inference'` in the cloud image (which has no runtime mount).
#   Local:  docker compose up --build         (compose sets context: . below)
#   Cloud:  deploy/deploy_backend.sh           (docker build -f backend/Dockerfile <repo-root>)
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
# (Paths are repo-root-relative now: requirements.txt lives under backend/.)
COPY backend/requirements.txt .
# Install the CUDA (cu124) torch/torchvision wheels first so the GPU-enabled
# builds are pinned before requirements.txt is resolved. The Celery worker runs
# inference on an NVIDIA GPU, so these must be the CUDA builds (not CPU-only).
RUN pip install --no-cache-dir torch==2.4.0 torchvision==0.19.0 --index-url https://download.pytorch.org/whl/cu124
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Django backend source into /app.
COPY backend/ /app/
# Copy the ML inference scripts to /app/ml/scripts so REPO_ROOT(/app)/ml/scripts
# and PYTHONPATH resolve INSIDE the image with NO runtime mount required. This is
# the fix for the run_png_inference ModuleNotFoundError. The runtime import chain
# needs run_png_inference.py + archs.py + run_wsi_inference.py + percentages_only.py
# (all under ml/scripts/); copying the whole dir keeps it simple and future-proof.
COPY ml/scripts/ /app/ml/scripts/

EXPOSE 8000

CMD ["gunicorn", "gigatime_backend.asgi:application", \
     "-w", "4", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000"]
