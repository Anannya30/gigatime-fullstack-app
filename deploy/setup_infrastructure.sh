#!/usr/bin/env bash
# =============================================================================
# setup_infrastructure.sh  —  GigaTIME one-time GCP infrastructure setup
# -----------------------------------------------------------------------------
# Run this ONCE before deploy_backend.sh / deploy_frontend.sh.
# It is IDEMPOTENT: every step checks for existence first, so it is safe to
# re-run after a partial failure.
#
# DATA RESIDENCY (hard requirement): all data-at-rest and data-processing
# resources MUST live in India. We pin everything to asia-south1 (Mumbai),
# single-region (NOT multi-region), and never default to a US/EU region.
#
# This script does NOT contain any real secret values. It creates EMPTY secret
# placeholders and prints the exact `gcloud secrets versions add` commands for
# you to run separately to populate them.
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# Configurable variables  (override by exporting before running, e.g.
#   PROJECT_ID=foo ./setup_infrastructure.sh )
# -----------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-biostack-virtual-mif}"
REGION="${REGION:-asia-south1}"            # Mumbai — India residency. DO NOT change to a non-India region.
AR_REPO="${AR_REPO:-gigatime}"             # Artifact Registry Docker repo name
AR_LOCATION="${AR_LOCATION:-asia-south1}"  # AR repo region — keep in India

# GCS bucket for whole-slide images / outputs, accessed via the S3-compatible API.
# MUST be single-region asia-south1 (data at rest stays in India).
GCS_BUCKET="${GCS_BUCKET:-gigatime-slides-mum}"   # must be globally unique; change if taken
GCS_LOCATION="${GCS_LOCATION:-asia-south1}"        # single-region India. NOT "asia" (multi-region).

# Runtime service account the backend VM (and Cloud Run, if desired) will use.
RUNTIME_SA_NAME="${RUNTIME_SA_NAME:-gigatime-backend-sa}"
RUNTIME_SA_EMAIL="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Custom IAM role id letting the VM stop/start ITSELF for idle auto-stop
# (least privilege — see section 3c). Project-scoped role.
SELF_STOP_ROLE_ID="${SELF_STOP_ROLE_ID:-gigatimeSelfStop}"

# GCS service account whose HMAC key gives S3-compatible access.
# (Can be the same SA as the runtime SA — kept separate here for clarity.)
GCS_HMAC_SA_NAME="${GCS_HMAC_SA_NAME:-gigatime-gcs-s3}"
GCS_HMAC_SA_EMAIL="${GCS_HMAC_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Secret Manager secret IDs (empty placeholders created below).
SECRETS=(
  gigatime-db-password
  gigatime-redis-url
  gigatime-s3-access-key
  gigatime-s3-secret-key
  gigatime-django-secret-key   # extra: Django SECRET_KEY should also come from Secret Manager, not a default
)

echo "==> Project=${PROJECT_ID}  Region=${REGION}  Bucket=${GCS_BUCKET}@${GCS_LOCATION}"
gcloud config set project "${PROJECT_ID}" 1>/dev/null

# -----------------------------------------------------------------------------
# 1. Enable required APIs (idempotent — enabling an already-enabled API is a no-op)
# -----------------------------------------------------------------------------
echo "==> [1/6] Enabling required APIs ..."
gcloud services enable \
  compute.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com \
  storage.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  --project "${PROJECT_ID}"
#   compute      -> GPU VM            run         -> Cloud Run frontend
#   artifactreg  -> Docker images     secretmgr   -> runtime secrets
#   cloudbuild   -> (optional) builds sqladmin    -> Cloud SQL (Option A only)
#   redis        -> Memorystore (Option A only)   storage -> GCS bucket

# -----------------------------------------------------------------------------
# 2. Artifact Registry Docker repository (India region)
# -----------------------------------------------------------------------------
echo "==> [2/6] Ensuring Artifact Registry repo '${AR_REPO}' in ${AR_LOCATION} ..."
if gcloud artifacts repositories describe "${AR_REPO}" \
      --location="${AR_LOCATION}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "    repo already exists — skipping"
else
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${AR_LOCATION}" \
    --description="GigaTIME backend/frontend images (India residency)" \
    --project "${PROJECT_ID}"
fi
echo "    Image path prefix: ${AR_LOCATION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"

# -----------------------------------------------------------------------------
# 3. Service accounts + IAM
# -----------------------------------------------------------------------------
echo "==> [3/6] Ensuring service accounts ..."

# 3a. Runtime SA for the backend VM: read secrets, pull images, read/write the bucket.
if ! gcloud iam service-accounts describe "${RUNTIME_SA_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${RUNTIME_SA_NAME}" \
    --display-name="GigaTIME backend runtime SA" --project "${PROJECT_ID}"
else
  echo "    runtime SA exists — skipping create"
fi

# 3b. GCS SA whose HMAC key backs the S3-compatible access (least privilege on the bucket).
if ! gcloud iam service-accounts describe "${GCS_HMAC_SA_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${GCS_HMAC_SA_NAME}" \
    --display-name="GigaTIME GCS S3-compat SA" --project "${PROJECT_ID}"
else
  echo "    GCS HMAC SA exists — skipping create"
fi

# IAM role bindings (add-iam-policy-binding is idempotent — re-adding is a no-op).
echo "    Binding IAM roles to ${RUNTIME_SA_EMAIL} ..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" --condition=None 1>/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/artifactregistry.reader" --condition=None 1>/dev/null

# 3c. Custom role so the VM can STOP/START ITSELF (idle auto-stop watcher).
#     Least privilege: EXACTLY compute.instances.stop/start/get and nothing more.
#     The built-in roles/compute.instanceAdmin.v1 would also work but is far too
#     broad (create/delete/attach-disk/etc.) — we deliberately avoid it so a
#     compromised VM token cannot do more than stop/start/get this instance.
echo "    Ensuring custom role '${SELF_STOP_ROLE_ID}' (compute.instances.stop/start/get) ..."
SELF_STOP_PERMS="compute.instances.stop,compute.instances.start,compute.instances.get"
if gcloud iam roles describe "${SELF_STOP_ROLE_ID}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  # Idempotent: keep the permission set in sync if the role already exists.
  gcloud iam roles update "${SELF_STOP_ROLE_ID}" --project "${PROJECT_ID}" \
    --permissions="${SELF_STOP_PERMS}" 1>/dev/null
  echo "    custom role exists — permissions synced"
else
  gcloud iam roles create "${SELF_STOP_ROLE_ID}" --project "${PROJECT_ID}" \
    --title="GigaTIME self stop/start" \
    --description="Allow the backend VM to stop/start/get ITSELF for idle auto-stop." \
    --permissions="${SELF_STOP_PERMS}" \
    --stage=GA 1>/dev/null
fi
# Bind the custom role to the runtime SA. The VM already runs with
# --scopes=cloud-platform (set in deploy_backend.sh), so no scope change needed.
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="projects/${PROJECT_ID}/roles/${SELF_STOP_ROLE_ID}" --condition=None 1>/dev/null

# -----------------------------------------------------------------------------
# 4. GCS bucket (single-region India) + bucket-scoped access for the HMAC SA
# -----------------------------------------------------------------------------
echo "==> [4/6] Ensuring GCS bucket gs://${GCS_BUCKET} in ${GCS_LOCATION} (single-region) ..."
if gcloud storage buckets describe "gs://${GCS_BUCKET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "    bucket already exists — skipping create"
else
  # --location=asia-south1 is a SINGLE region (India). Do NOT use --location=asia
  # (that is the Asia MULTI-region and would place replicas outside India).
  gcloud storage buckets create "gs://${GCS_BUCKET}" \
    --project "${PROJECT_ID}" \
    --location="${GCS_LOCATION}" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

# Grant the GCS HMAC SA object read/write on JUST this bucket (least privilege).
echo "    Granting objectAdmin on the bucket to ${GCS_HMAC_SA_EMAIL} ..."
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="serviceAccount:${GCS_HMAC_SA_EMAIL}" \
  --role="roles/storage.objectAdmin" 1>/dev/null
# The runtime SA also needs to read/write the bucket when using the native client
# (the S3 HMAC path uses the HMAC key; this covers the fallback / signed-URL paths).
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="serviceAccount:${RUNTIME_SA_EMAIL}" \
  --role="roles/storage.objectAdmin" 1>/dev/null

# -----------------------------------------------------------------------------
# 5. Secret Manager — create EMPTY placeholders (no real values in this script)
# -----------------------------------------------------------------------------
echo "==> [5/6] Ensuring empty Secret Manager placeholders ..."
for s in "${SECRETS[@]}"; do
  if gcloud secrets describe "${s}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    echo "    secret '${s}' exists — skipping"
  else
    # user-managed replication pinned to asia-south1 keeps the secret PAYLOAD in
    # India, satisfying the hard data-residency requirement. (The default
    # "automatic" replication could place payload replicas OUTSIDE India, which
    # would violate residency — so we do not use it here.)
    gcloud secrets create "${s}" \
      --replication-policy="user-managed" \
      --locations="asia-south1" \
      --project "${PROJECT_ID}"
  fi
done

# -----------------------------------------------------------------------------
# (OPTIONAL) Firewall for the backend's port 8000 — INTENTIONALLY NOT ENABLED.
# -----------------------------------------------------------------------------
# Nothing in this script opens tcp:8000 on the GPU VM, so the Cloud Run frontend
# cannot reach the backend yet. HOW you open that path is an ARCHITECTURE
# DECISION you must confirm with your boss BEFORE enabling anything here, because
# this is clinical data.
#
#   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
#   WARNING: do NOT expose raw HTTP :8000 to the public internet for clinical
#   data. Both blocks below are COMMENTED OUT on purpose. Uncomment ONE only
#   after the ingress architecture is signed off.
#   !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
#
# ----- Option 1 (NOT recommended — INSECURE, demo/dev ONLY) -------------------
# Opens tcp:8000 to the ENTIRE internet over plain HTTP: no TLS, no source
# restriction. Acceptable ONLY for a throwaway demo with NON-sensitive data.
#   gcloud compute firewall-rules create gigatime-backend-8000-open \\
#     --project="${PROJECT_ID}" \\
#     --direction=INGRESS --action=ALLOW --rules=tcp:8000 \\
#     --source-ranges=0.0.0.0/0 \\
#     --target-tags=gigatime-backend
#   # (and add --tags=gigatime-backend to the VM in deploy_backend.sh)
#
# ----- Option 2 (RECOMMENDED for clinical data) ------------------------------
# Do NOT expose the VM directly. Put an HTTPS load balancer (or an authenticated
# path such as IAP / a serverless VPC connector from Cloud Run) IN FRONT of the
# VM so traffic is TLS-terminated and authenticated, and RESTRICT the firewall
# source ranges to just the load-balancer / health-check ranges, e.g.:
#   gcloud compute firewall-rules create gigatime-backend-from-lb \\
#     --project="${PROJECT_ID}" \\
#     --direction=INGRESS --action=ALLOW --rules=tcp:8000 \\
#     --source-ranges=130.211.0.0/22,35.191.0.0/16 \\   # GCP LB + health-check ranges
#     --target-tags=gigatime-backend
#
# DECISION REQUIRED: confirm the chosen ingress architecture 
# before uncommenting EITHER option.
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# 6. Print the manual follow-up commands (secrets + HMAC) — NOT executed here
# -----------------------------------------------------------------------------
cat <<EOF

==> [6/6] DONE creating infrastructure. NEXT, run these MANUALLY (values are secret):

  # ---- (a) Create an HMAC key for S3-compatible access to the bucket ----
  # This prints an ACCESS_ID and a one-time SECRET. Capture both immediately.
  gcloud storage hmac create ${GCS_HMAC_SA_EMAIL} --project ${PROJECT_ID}
  #   -> note the "accessId" (= AWS_ACCESS_KEY_ID) and "secret" (= AWS_SECRET_ACCESS_KEY)

  # ---- (b) Populate Secret Manager (pipe values via stdin; nothing on disk) ----
  printf '%s' 'PASTE_DB_PASSWORD'        | gcloud secrets versions add gigatime-db-password    --data-file=- --project ${PROJECT_ID}
  printf '%s' 'redis://REDIS_HOST:6379/0'| gcloud secrets versions add gigatime-redis-url      --data-file=- --project ${PROJECT_ID}
  printf '%s' 'PASTE_HMAC_ACCESS_ID'     | gcloud secrets versions add gigatime-s3-access-key  --data-file=- --project ${PROJECT_ID}
  printf '%s' 'PASTE_HMAC_SECRET'        | gcloud secrets versions add gigatime-s3-secret-key  --data-file=- --project ${PROJECT_ID}
  python3 -c "import secrets;print(secrets.token_urlsafe(64))" \\
                                         | gcloud secrets versions add gigatime-django-secret-key --data-file=- --project ${PROJECT_ID}

  # For self-hosted Redis on the VM (Option B, the default), redis-url is just:
  #   redis://redis:6379/0   (the compose service name on the VM's docker network)

==> QUOTA WARNING (read before deploy_backend.sh):
    The L4 GPU quota 'NVIDIA_L4_GPUS' in ${REGION} is frequently 0 on a new
    project and must be requested PER REGION. Check + request:
      gcloud compute regions describe ${REGION} \\
        --format="table(quotas.metric,quotas.limit,quotas.usage)" | grep -i l4
      # If limit is 0: IAM & Admin > Quotas > filter "NVIDIA_L4_GPUS" + region=${REGION} > Edit > request >=1
EOF

echo "==> setup_infrastructure.sh complete."
