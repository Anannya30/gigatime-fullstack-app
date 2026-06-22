#!/usr/bin/env bash
# =============================================================================
# backend_startup.sh  —  GPU VM startup script (runs ON the instance at boot)
# -----------------------------------------------------------------------------
# This is passed to the VM via `--metadata-from-file=startup-script=...` by
# deploy_backend.sh. It executes as root on every boot of the GPU instance.
#
# It reads its configuration from INSTANCE METADATA (set by deploy_backend.sh)
# rather than having values baked in, and pulls all SECRETS from Secret Manager
# at boot — secrets are never baked into the image or this script.
#
# Output is logged to /var/log/gigatime-startup.log AND to the serial console.
# =============================================================================
set -euo pipefail
exec > >(tee -a /var/log/gigatime-startup.log) 2>&1
echo "===== GigaTIME startup $(date -u) ====="

# --- helpers to read instance metadata -------------------------------------
MD="http://metadata.google.internal/computeMetadata/v1"
md() { curl -s -H "Metadata-Flavor: Google" "${MD}/instance/attributes/$1"; }

PROJECT_ID="$(curl -s -H 'Metadata-Flavor: Google' ${MD}/project/project-id)"
AR_IMAGE="$(md ar-image)"          # full image ref, e.g. asia-south1-docker.pkg.dev/PROJ/gigatime/backend:TAG
AR_LOCATION="$(md ar-location)"    # e.g. asia-south1  (for docker auth)
GCS_BUCKET="$(md gcs-bucket)"      # bucket name (S3-compatible target)
S3_ENDPOINT="$(md s3-endpoint)"    # https://storage.googleapis.com
DEPLOY_MODE="$(md deploy-mode)"    # "selfhosted" (Option B, default) | "managed" (Option A)
# Idle auto-stop tuning (set as instance metadata by deploy_backend.sh):
IDLE_MINUTES="$(md idle-minutes)"; IDLE_MINUTES="${IDLE_MINUTES:-15}"
IDLE_TIMER_INTERVAL="$(md idle-timer-interval)"; IDLE_TIMER_INTERVAL="${IDLE_TIMER_INTERVAL:-2min}"
# Worker container/service the idle watcher exec's into. Falls back to the
# DEPLOY_MODE default if the metadata key is absent (older deploy_backend.sh).
WORKER_CONTAINER="$(md worker-container)"
if [ -z "${WORKER_CONTAINER}" ]; then
  if [ "${DEPLOY_MODE}" = "managed" ]; then WORKER_CONTAINER="gigatime-celery"; else WORKER_CONTAINER="celery"; fi
fi
APP_DIR=/opt/gigatime
mkdir -p "${APP_DIR}"

# --- 1. NVIDIA driver -------------------------------------------------------
# On Google Deep Learning VM (DLVM) images, the GPU driver is installed
# automatically when the instance metadata key install-nvidia-driver=True is
# set (deploy_backend.sh sets it). We just verify here.
echo "==> Verifying NVIDIA driver (L4 / Ada Lovelace needs driver >=535, CUDA 12.x) ..."
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "    nvidia-smi missing — on a NON-DLVM base image, install the driver here, e.g.:"
  echo "    /opt/deeplearning/install-driver.sh   # (DLVM) or the .run installer for plain Ubuntu"
fi
nvidia-smi || echo "    WARNING: nvidia-smi not ready yet (driver may still be installing on first boot)"

# --- 2. Docker + NVIDIA Container Toolkit -----------------------------------
# DLVM images ship Docker + the NVIDIA Container Toolkit preinstalled. For a
# plain Ubuntu base image, uncomment the install block below.
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker + NVIDIA Container Toolkit (non-DLVM path) ..."
  apt-get update -y
  apt-get install -y docker.io curl gnupg
  systemctl enable --now docker
  # NVIDIA Container Toolkit (lets `docker --gpus all` see the L4):
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -y && apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker && systemctl restart docker
fi

# --- 3. Authenticate Docker to Artifact Registry ----------------------------
echo "==> Configuring Docker auth for ${AR_LOCATION}-docker.pkg.dev ..."
gcloud auth configure-docker "${AR_LOCATION}-docker.pkg.dev" --quiet

# --- 4. Pull secrets from Secret Manager (NEVER baked into the image) -------
echo "==> Fetching runtime secrets from Secret Manager ..."
get_secret() { gcloud secrets versions access latest --secret="$1" --project "${PROJECT_ID}"; }
DB_PASSWORD="$(get_secret gigatime-db-password)"
S3_ACCESS_KEY="$(get_secret gigatime-s3-access-key)"
S3_SECRET_KEY="$(get_secret gigatime-s3-secret-key)"
DJANGO_SECRET_KEY="$(get_secret gigatime-django-secret-key)"
# For self-hosted Redis the URL is the compose service name; for managed it comes from Secret Manager.
if [ "${DEPLOY_MODE}" = "managed" ]; then
  REDIS_URL="$(get_secret gigatime-redis-url)"
else
  REDIS_URL="redis://redis:6379/0"
fi

# --- 5. Write the runtime .env (root-only) ----------------------------------
# These map to the variables documented in deploy/.env.example.
echo "==> Writing ${APP_DIR}/.env ..."
umask 077
cat > "${APP_DIR}/.env" <<ENV
DJANGO_SETTINGS_MODULE=gigatime_backend.settings.production
SECRET_KEY=${DJANGO_SECRET_KEY}
DB_HOST=db
DB_PASSWORD=${DB_PASSWORD}
POSTGRES_PASSWORD=${DB_PASSWORD}
REDIS_URL=${REDIS_URL}
# --- S3-compatible storage (GCS via the S3 API). If these are present the app
# --- uses S3 storage; if absent it falls back to local/env paths (see .env.example).
AWS_ACCESS_KEY_ID=${S3_ACCESS_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET_KEY}
AWS_S3_ENDPOINT_URL=${S3_ENDPOINT}
S3_BUCKET=${GCS_BUCKET}
ENV

# --- 6. Bring up the stack --------------------------------------------------
if [ "${DEPLOY_MODE}" = "managed" ]; then
  # ===== OPTION A (managed): Cloud SQL + Memorystore =====================
  # Postgres and Redis are external managed services; we run ONLY the app
  # (web) and the GPU worker (celery) containers here. DB_HOST/REDIS_URL come
  # from Secret Manager (set DB_HOST via metadata if you enable this path).
  echo "==> [managed] Running backend + GPU celery against Cloud SQL/Memorystore ..."
  docker pull "${AR_IMAGE}"
  docker run -d --name gigatime-web --restart unless-stopped \
    --env-file "${APP_DIR}/.env" -p 8000:8000 "${AR_IMAGE}" \
    sh -c "python manage.py migrate && gunicorn gigatime_backend.asgi:application -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000"
  docker run -d --name gigatime-celery --restart unless-stopped --gpus all \
    --env-file "${APP_DIR}/.env" "${AR_IMAGE}" \
    celery -A gigatime_backend worker --loglevel=info
else
  # ===== OPTION B (self-hosted, DEFAULT): Postgres + Redis as containers ===
  # Mirrors the local docker-compose stack. The GPU is attached ONLY to the
  # celery worker (the ML inference); db/redis/web do not need it.
  echo "==> [selfhosted] Writing docker-compose.prod.yml and bringing the stack up ..."
  cat > "${APP_DIR}/docker-compose.prod.yml" <<COMPOSE
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: gigatime_db
      POSTGRES_USER: gigatime_user
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U gigatime_user -d gigatime_db"], interval: 5s, retries: 5 }
  redis:
    image: redis:7-alpine
    volumes: [ "redisdata:/data" ]
  backend:
    image: ${AR_IMAGE}
    env_file: [ "${APP_DIR}/.env" ]
    depends_on: { db: { condition: service_healthy }, redis: { condition: service_started } }
    ports: [ "8000:8000" ]
    command: sh -c "python manage.py migrate && gunicorn gigatime_backend.asgi:application -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000"
  celery:
    image: ${AR_IMAGE}
    env_file: [ "${APP_DIR}/.env" ]
    depends_on: [ backend, redis, db ]
    # Attach the L4 GPU to the worker only:
    deploy:
      resources:
        reservations:
          devices: [ { driver: nvidia, count: 1, capabilities: ["gpu"] } ]
    command: celery -A gigatime_backend worker --loglevel=info
volumes: { pgdata: {}, redisdata: {} }
COMPOSE
  docker pull "${AR_IMAGE}"
  # docker compose v2 plugin ships with recent Docker; on DLVM it is present.
  ( cd "${APP_DIR}" && docker compose --env-file "${APP_DIR}/.env" -f docker-compose.prod.yml up -d )
fi

# --- 7. Idle auto-stop watcher (systemd service + timer) --------------------
# Stops THIS Spot VM after a continuous ${IDLE_MINUTES} with no Celery work, so
# we are billed for compute only while the pipeline is in use. The watcher asks
# Celery (via gigatime_backend.ops.idle_check) whether any task is active,
# reserved, scheduled, or queued; it only stops when ALL are zero, and fails
# safe (treats "can't tell" as busy). A stop is safe here: --instance-
# termination-action=STOP + NoopScratch means an in-flight slide just re-runs.
echo "==> [7] Installing idle auto-stop watcher (IDLE_MINUTES=${IDLE_MINUTES}, every ${IDLE_TIMER_INTERVAL}) ..."

# 7a. The watcher script. Quoted heredoc ('WATCH') => written LITERALLY; the
#     $(...) / ${...} below are evaluated when the watcher RUNS, not now.
cat > "${APP_DIR}/idle_watch.sh" <<'WATCH'
#!/usr/bin/env bash
# GigaTIME idle auto-stop watcher (run by gigatime-idle-stop.service via a timer).
# Stops THIS VM after a continuous IDLE_MINUTES with no Celery work.
set -uo pipefail
APP_DIR=/opt/gigatime
STAMP=/var/run/gigatime-last-busy
IDLE_MINUTES="${IDLE_MINUTES:-15}"
DEPLOY_MODE="${DEPLOY_MODE:-selfhosted}"
# SINGLE place the worker container/service name is assumed — now metadata-tunable
# via WORKER_CONTAINER (set by deploy_backend.sh; falls back per DEPLOY_MODE here).
WORKER_CONTAINER="${WORKER_CONTAINER:-}"
if [ -z "${WORKER_CONTAINER}" ]; then
  if [ "${DEPLOY_MODE}" = "managed" ]; then WORKER_CONTAINER="gigatime-celery"; else WORKER_CONTAINER="celery"; fi
fi
MD="http://metadata.google.internal/computeMetadata/v1"
md(){ curl -s -H "Metadata-Flavor: Google" "$1"; }

# Run the idle check INSIDE the running worker container (it has the app+broker).
run_idle_check() {
  if [ "${DEPLOY_MODE}" = "managed" ]; then
    docker exec "${WORKER_CONTAINER}" python -m gigatime_backend.ops.idle_check
  else
    docker compose -f "${APP_DIR}/docker-compose.prod.yml" --env-file "${APP_DIR}/.env" \
      exec -T "${WORKER_CONTAINER}" python -m gigatime_backend.ops.idle_check
  fi
}

now="$(date +%s)"
[ -f "${STAMP}" ] || echo "${now}" > "${STAMP}"

if run_idle_check; then
  # IDLE (exit 0): do NOT refresh the stamp; measure continuous idle since last busy.
  last="$(cat "${STAMP}" 2>/dev/null || echo "${now}")"
  elapsed="$(( now - last ))"
  threshold="$(( IDLE_MINUTES * 60 ))"
  echo "idle_watch: idle ${elapsed}s / threshold ${threshold}s"
  if [ "${elapsed}" -ge "${threshold}" ]; then
    NAME="$(md "${MD}/instance/name")"
    ZONE="$(md "${MD}/instance/zone")"; ZONE="${ZONE##*/}"   # strip projects/.../zones/ prefix
    echo "idle_watch: idle >= ${IDLE_MINUTES}m — stopping ${NAME} in ${ZONE}"
    gcloud compute instances stop "${NAME}" --zone "${ZONE}" --quiet
  fi
else
  # BUSY or UNKNOWN (any non-zero exit) -> reset the timer. Fail safe: we stop
  # ONLY when idle_check positively confirmed idleness (exit 0).
  echo "idle_watch: busy/unknown — resetting idle timer"
  echo "${now}" > "${STAMP}"
fi
WATCH
chmod +x "${APP_DIR}/idle_watch.sh"

# 7b. systemd service (oneshot) — IDLE_MINUTES/DEPLOY_MODE are baked in NOW
#     (unquoted heredoc) from this boot's metadata values.
cat > /etc/systemd/system/gigatime-idle-stop.service <<SERVICE
[Unit]
Description=GigaTIME idle auto-stop check
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
Environment=IDLE_MINUTES=${IDLE_MINUTES}
Environment=DEPLOY_MODE=${DEPLOY_MODE}
Environment=WORKER_CONTAINER=${WORKER_CONTAINER}
ExecStart=${APP_DIR}/idle_watch.sh
SERVICE

# 7c. systemd timer — first check 5 min after boot, then every ${IDLE_TIMER_INTERVAL}.
cat > /etc/systemd/system/gigatime-idle-stop.timer <<TIMER
[Unit]
Description=Run the GigaTIME idle auto-stop check periodically

[Timer]
OnBootSec=5min
OnUnitActiveSec=${IDLE_TIMER_INTERVAL}
Unit=gigatime-idle-stop.service

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now gigatime-idle-stop.timer
echo "    idle auto-stop timer enabled."

echo "===== GigaTIME startup complete $(date -u) ====="

# =============================================================================
# SPOT INTERPRETATION / CHECKPOINT NOTE  (read deploy_backend.sh header too).
# On a Spot reclaim the VM gets ~30s notice then STOPs (because deploy_backend.sh
# sets --instance-termination-action=STOP, so the disk + containers survive and
# the instance can simply be restarted).
#
# The pipeline uses NoopScratch: it writes NO scratch files and NO OME-TIFF, and
# only emits the 21 positive-marker percentages + a confidence score per slide.
# So a Spot reclaim mid-slide simply means that slide is RE-RUN from the start —
# there is no intermediate scratch state to persist or resume.
#
# If checkpointing is wanted later, the natural boundary is still the tile loop
# in ml/scripts/run_wsi_inference — but there is no scratch state to persist,
# only the FINAL per-marker results, which should be written to the GCS bucket
# as soon as a slide completes.
# =============================================================================
