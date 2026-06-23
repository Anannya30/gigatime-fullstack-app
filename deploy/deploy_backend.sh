#!/usr/bin/env bash
# =============================================================================
# deploy_backend.sh  —  Build + push the GigaTIME backend image and provision
#                       the GPU VM that runs Django + Celery + the CUDA pipeline.
# -----------------------------------------------------------------------------
# !!! GPU / REGION DECISION — READ FIRST !!!
# The original spec asked for an "NVIDIA A100 40GB" GPU. That has been CHANGED to
# an "NVIDIA L4 24GB" in asia-south1 (Mumbai), because:
#   * The clinical data has a HARD data-residency requirement: it must stay in
#     India. asia-south1 (Mumbai) is the only Indian GCP region.
#   * A100 GPUs are NOT offered in any Indian region — A100 in Asia is only in
#     Tokyo / Seoul / Singapore, all OUTSIDE India.
#   * Residency wins over raw GPU spec, so we target the L4 (24GB, Ada Lovelace),
#     which IS available in asia-south1 via the g2 machine series.
# If you later get an India residency exception, switch GPU_TYPE/MACHINE_TYPE/ZONE.
# -----------------------------------------------------------------------------
# This script does the build+push, then `gcloud compute instances create`. It
# does NOT run any workload — review every command before executing.
# Run AFTER setup_infrastructure.sh and AFTER populating Secret Manager.
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# Configurable variables (all knobs live here)
# -----------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-biostack-virtual-mif}"
REGION="${REGION:-asia-south1}"             # Mumbai — India residency. Do NOT move outside India.
ZONE="${ZONE:-asia-south1-a}"               # see ZONE note below
INSTANCE_NAME="${INSTANCE_NAME:-gigatime-gpu}"

# --- GPU / machine -----------------------------------------------------------
# g2 series ALREADY INCLUDES the L4 GPU: g2-standard-8 == 8 vCPU / 32GB / 1x L4.
# You therefore do NOT pass --accelerator for g2 (the GPU is implicit). We still
# expose GPU_TYPE for documentation / a possible non-g2 path.
MACHINE_TYPE="${MACHINE_TYPE:-g2-standard-8}"
GPU_TYPE="${GPU_TYPE:-nvidia-l4}"           # informational for g2; implicit in the machine type
BOOT_DISK_GB="${BOOT_DISK_GB:-200}"         # CUDA + model + room; persistent SSD
BOOT_DISK_TYPE="${BOOT_DISK_TYPE:-pd-ssd}"

# ZONE note — asia-south1 zones that have offered L4 (g2): -a, -b, -c.
# If one is out of capacity ("ZONE_RESOURCE_POOL_EXHAUSTED"), switch ZONE above.
# Verify current L4 availability with:
#   gcloud compute accelerator-types list --filter="zone:( asia-south1-a asia-south1-b asia-south1-c )"
#   gcloud compute machine-types list --filter="zone:( asia-south1-a asia-south1-b asia-south1-c ) AND name=g2-standard-8"

# --- Base image: Google Deep Learning VM (CUDA + Docker + NVIDIA toolkit) -----
# common-cu123 = Debian + CUDA 12.3 toolchain; driver 535+ supports L4 (Ada).
IMAGE_FAMILY="${IMAGE_FAMILY:-common-cu129-ubuntu-2204-nvidia-580}"
IMAGE_PROJECT="${IMAGE_PROJECT:-deeplearning-platform-release}"

# --- Artifact Registry / image ----------------------------------------------
AR_REPO="${AR_REPO:-gigatime}"
AR_LOCATION="${AR_LOCATION:-asia-south1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BACKEND_IMAGE="${AR_LOCATION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/backend:${IMAGE_TAG}"
# Build context is the REPO ROOT (one level up from deploy/) so the image bundles
# BOTH backend/ and ml/scripts/ — fixes "ModuleNotFoundError: run_png_inference"
# (the cloud image has no runtime mount). The Dockerfile lives at backend/Dockerfile,
# and the repo-root .dockerignore keeps the 5.3 GB ml/data/ out of the context.
BUILD_CONTEXT="${BUILD_CONTEXT:-$(cd "$(dirname "$0")/.." && pwd)}"
DOCKERFILE="${DOCKERFILE:-${BUILD_CONTEXT}/backend/Dockerfile}"

# --- Runtime identity / storage / mode ---------------------------------------
RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-gigatime-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
GCS_BUCKET="${GCS_BUCKET:-gigatime-slides-mum}"
S3_ENDPOINT="${S3_ENDPOINT:-https://storage.googleapis.com}"
DEPLOY_MODE="${DEPLOY_MODE:-selfhosted}"    # "selfhosted" (Option B, DEFAULT) | "managed" (Option A)

# --- Idle auto-stop (the VM stops ITSELF after this much continuous idle) -----
# Passed to the VM as metadata; backend_startup.sh installs a systemd timer that
# stops the instance after IDLE_MINUTES of no Celery work (active/reserved/
# scheduled/queued all zero). Tune here without editing the startup script.
IDLE_MINUTES="${IDLE_MINUTES:-15}"                  # minutes of no work before self-stop
IDLE_TIMER_INTERVAL="${IDLE_TIMER_INTERVAL:-2min}"  # how often the watcher checks (systemd OnUnitActiveSec)
# Name of the Celery worker container/service the idle watcher exec's into.
# Leave EMPTY to auto-resolve from DEPLOY_MODE below: "celery" (compose service,
# Option B) or "gigatime-celery" (docker run name, Option A). Override only if
# you rename the worker service/container.
WORKER_CONTAINER="${WORKER_CONTAINER:-}"
if [ -z "${WORKER_CONTAINER}" ]; then
  if [ "${DEPLOY_MODE}" = "managed" ]; then
    WORKER_CONTAINER="gigatime-celery"
  else
    WORKER_CONTAINER="celery"
  fi
fi

STARTUP_SCRIPT="${STARTUP_SCRIPT:-$(dirname "$0")/backend_startup.sh}"

echo "==> Project=${PROJECT_ID} Zone=${ZONE} Machine=${MACHINE_TYPE} (1x L4) Mode=${DEPLOY_MODE}"
gcloud config set project "${PROJECT_ID}" 1>/dev/null

# -----------------------------------------------------------------------------
# QUOTA PRE-FLIGHT — the L4 quota is the most common hard blocker
# -----------------------------------------------------------------------------
echo "==> [pre-flight] Checking NVIDIA_L4_GPUS quota in ${REGION} ..."
echo "    (On a new project this is often 0 and must be requested PER REGION.)"
gcloud compute regions describe "${REGION}" --project "${PROJECT_ID}" \
  --format="value(quotas)" | tr ';' '\n' | grep -i "L4" || true
echo "    If the L4 limit is 0: IAM & Admin > Quotas > filter 'NVIDIA_L4_GPUS' + region=${REGION}"
echo "    > Edit Quotas > request >= 1. Deployment will FAIL until this is granted."

# -----------------------------------------------------------------------------
# 1. Build + push the backend image to Artifact Registry (India)
# -----------------------------------------------------------------------------
echo "==> [1/3] Building + pushing backend image: ${BACKEND_IMAGE}"
gcloud auth configure-docker "${AR_LOCATION}-docker.pkg.dev" --quiet
# linux/amd64 explicitly so the image runs on the x86 GPU VM regardless of your laptop arch.
# -f points at backend/Dockerfile; the context is the repo root (bundles ml/scripts).
docker build --platform=linux/amd64 -f "${DOCKERFILE}" -t "${BACKEND_IMAGE}" "${BUILD_CONTEXT}"
docker push "${BACKEND_IMAGE}"
#   Alternative (build in the cloud, no local Docker needed). The Dockerfile is at
#   backend/Dockerfile relative to the repo-root context, so pass it explicitly via
#   a cloudbuild config (plain `--tag` expects a Dockerfile at the context root):
#   gcloud builds submit "${BUILD_CONTEXT}" --config "${BUILD_CONTEXT}/deploy/cloudbuild.backend.yaml" --project "${PROJECT_ID}"

# -----------------------------------------------------------------------------
# 2. Sanity-check the startup script exists
# -----------------------------------------------------------------------------
echo "==> [2/3] Using startup script: ${STARTUP_SCRIPT}"
[ -f "${STARTUP_SCRIPT}" ] || { echo "ERROR: startup script not found: ${STARTUP_SCRIPT}"; exit 1; }

# -----------------------------------------------------------------------------
# 3. Create the SPOT GPU instance
# -----------------------------------------------------------------------------
# SPOT RESILIENCE (important):
#   --provisioning-model=SPOT          -> cheap, but GCP can RECLAIM with ~30s notice.
#   --instance-termination-action=STOP -> on reclaim the VM STOPS (not deleted), so the
#                                         boot disk, the docker volumes (Postgres data,
#                                         Redis) and the .env all SURVIVE. You just
#                                         `gcloud compute instances start` it again.
#   The pipeline uses NoopScratch (no scratch files, no OME-TIFF) and emits only the
#   per-slide marker %s + confidence, so a reclaim mid-slide just means that slide is
#   RE-RUN — there is no intermediate state to resume (see backend_startup.sh footer).
#
# GPU notes:
#   * g2-standard-8 implicitly carries 1x L4 — no --accelerator needed.
#   * --maintenance-policy=TERMINATE is REQUIRED for GPU VMs (they can't live-migrate).
#   * metadata install-nvidia-driver=True tells the DLVM image to install the driver.
echo "==> [3/3] Creating SPOT GPU instance '${INSTANCE_NAME}' (1x L4, ${MACHINE_TYPE}) ..."
gcloud compute instances create "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --zone="${ZONE}" \
  --machine-type="${MACHINE_TYPE}" \
  --provisioning-model=SPOT \
  --instance-termination-action=STOP \
  --maintenance-policy=TERMINATE \
  --image-family="${IMAGE_FAMILY}" \
  --image-project="${IMAGE_PROJECT}" \
  --boot-disk-size="${BOOT_DISK_GB}GB" \
  --boot-disk-type="${BOOT_DISK_TYPE}" \
  --service-account="${RUNTIME_SA_EMAIL}" \
  --scopes="https://www.googleapis.com/auth/cloud-platform" \
  --metadata="install-nvidia-driver=True,ar-image=${BACKEND_IMAGE},ar-location=${AR_LOCATION},gcs-bucket=${GCS_BUCKET},s3-endpoint=${S3_ENDPOINT},deploy-mode=${DEPLOY_MODE},idle-minutes=${IDLE_MINUTES},idle-timer-interval=${IDLE_TIMER_INTERVAL},worker-container=${WORKER_CONTAINER}" \
  --metadata-from-file="startup-script=${STARTUP_SCRIPT}"
#   For an explicit non-g2 path you would ADD (and pick a zone with that GPU):
#     --accelerator="type=${GPU_TYPE},count=1"

cat <<EOF

==> Backend VM creation issued. Useful follow-ups:
    # Watch the startup script (driver install + docker compose up):
    gcloud compute ssh ${INSTANCE_NAME} --zone ${ZONE} --command 'sudo tail -f /var/log/gigatime-startup.log'
    # Get the external IP (point the Cloud Run frontend BACKEND_URL at http://EXTERNAL_IP:8000):
    gcloud compute instances describe ${INSTANCE_NAME} --zone ${ZONE} \\
      --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

==> COST CONTROL (Spot still bills while RUNNING):
    gcloud compute instances stop   ${INSTANCE_NAME} --zone ${ZONE}   # stop billing for compute (disk still billed)
    gcloud compute instances start  ${INSTANCE_NAME} --zone ${ZONE}   # resume (re-runs startup script)
    gcloud compute instances delete ${INSTANCE_NAME} --zone ${ZONE}   # tear down completely
EOF
echo "==> deploy_backend.sh complete."
