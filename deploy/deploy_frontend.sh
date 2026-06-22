#!/usr/bin/env bash
# =============================================================================
# deploy_frontend.sh  —  Build + push the React frontend image and deploy it to
#                        Cloud Run (scales to zero) in asia-south1 (Mumbai).
# -----------------------------------------------------------------------------
# Residency: Cloud Run service runs in asia-south1 (India). Do NOT default to a
# US/EU region. Run AFTER setup_infrastructure.sh.
# Does NOT run any workload beyond build/deploy — review before executing.
# =============================================================================
#
# !!! TODO — CONFIRM BEFORE RUNNING: how does the React app receive the backend URL?
#   * BUILD-time (Vite): if the app reads VITE_API_BASE, Vite BAKES it into the
#     static bundle at build time. The URL must then be passed as a Docker
#     --build-arg in the build step below, and the Cloud Run --set-env-vars=
#     BACKEND_URL=... will have NO effect.
#   * RUNTIME: if the backend URL is resolved at runtime (e.g. an nginx entrypoint
#     templates it into config, or an SSR/proxy layer reads the env), then the
#     Cloud Run --set-env-vars=BACKEND_URL=... below IS the correct mechanism.
#   Do NOT guess — confirm which one this frontend uses and wire up exactly ONE.
#   Both paths are left documented here and at the build/deploy steps below.
#
set -euo pipefail

# -----------------------------------------------------------------------------
# Configurable variables
# -----------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-biostack-virtual-mif}"
REGION="${REGION:-asia-south1}"             # Cloud Run region — India residency
SERVICE_NAME="${SERVICE_NAME:-gigatime-frontend}"

AR_REPO="${AR_REPO:-gigatime}"
AR_LOCATION="${AR_LOCATION:-asia-south1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FRONTEND_IMAGE="${AR_LOCATION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/frontend:${IMAGE_TAG}"
FRONTEND_CONTEXT="${FRONTEND_CONTEXT:-../frontend}"   # path to frontend Dockerfile context

# Backend URL the frontend talks to. Point this at the GPU VM's external IP:8000
# (from deploy_backend.sh output), or a load balancer / domain in front of it.
BACKEND_URL="${BACKEND_URL:-http://REPLACE_WITH_BACKEND_IP:8000}"

# Auth toggle. DEFAULT: require authentication (no public access).
# Set ALLOW_UNAUTH=true to expose the service publicly (e.g. demo).
ALLOW_UNAUTH="${ALLOW_UNAUTH:-false}"

# Scale-to-zero is the Cloud Run default (min-instances=0). Kept explicit here.
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-4}"

echo "==> Project=${PROJECT_ID} Region=${REGION} Service=${SERVICE_NAME} AllowUnauth=${ALLOW_UNAUTH}"
gcloud config set project "${PROJECT_ID}" 1>/dev/null

# -----------------------------------------------------------------------------
# 1. Build + push the frontend image
# -----------------------------------------------------------------------------
echo "==> [1/2] Building + pushing frontend image: ${FRONTEND_IMAGE}"
gcloud auth configure-docker "${AR_LOCATION}-docker.pkg.dev" --quiet
docker build --platform=linux/amd64 -t "${FRONTEND_IMAGE}" "${FRONTEND_CONTEXT}"
docker push "${FRONTEND_IMAGE}"
#   Cloud-side alternative: gcloud builds submit "${FRONTEND_CONTEXT}" --tag "${FRONTEND_IMAGE}"

# -----------------------------------------------------------------------------
# 2. Deploy to Cloud Run
# -----------------------------------------------------------------------------
# Auth flag: --allow-unauthenticated exposes publicly; --no-allow-unauthenticated
# requires an authenticated caller (IAM roles/run.invoker). We choose per ALLOW_UNAUTH.
if [ "${ALLOW_UNAUTH}" = "true" ]; then
  AUTH_FLAG="--allow-unauthenticated"
  echo "    NOTE: deploying with PUBLIC (unauthenticated) access."
else
  AUTH_FLAG="--no-allow-unauthenticated"
  echo "    NOTE: deploying with AUTH REQUIRED. Grant access with:"
  echo "      gcloud run services add-iam-policy-binding ${SERVICE_NAME} --region ${REGION} \\"
  echo "        --member='user:SOMEONE@example.com' --role='roles/run.invoker'"
fi

echo "==> [2/2] Deploying ${SERVICE_NAME} to Cloud Run in ${REGION} (scale-to-zero) ..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${FRONTEND_IMAGE}" \
  --platform=managed \
  --port=80 \
  --min-instances="${MIN_INSTANCES}" \
  --max-instances="${MAX_INSTANCES}" \
  --set-env-vars="BACKEND_URL=${BACKEND_URL}" \
  ${AUTH_FLAG}
# NOTE on the frontend build: a static React (Vite) build bakes VITE_* vars at
# BUILD time, not runtime. If the app reads the backend URL from VITE_API_BASE at
# build time, pass it as a build arg instead, e.g.:
#   docker build --build-arg VITE_API_BASE="${BACKEND_URL}" ...
# The Cloud Run BACKEND_URL env above is for runtime config (e.g. an nginx
# entrypoint that templates it, or an SSR/proxy layer).

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)' 2>/dev/null || true)"
cat <<EOF

==> Frontend deployed. URL: ${SERVICE_URL:-<run: gcloud run services describe ${SERVICE_NAME} --region ${REGION}>}

==> COST CONTROL: Cloud Run scales to zero (min-instances=0) so idle cost is ~\$0.
    Remove the service entirely with:
      gcloud run services delete ${SERVICE_NAME} --region ${REGION}
EOF
echo "==> deploy_frontend.sh complete."
