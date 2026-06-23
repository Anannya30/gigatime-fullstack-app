# GigaTIME — GCP Deployment (asia-south1 / Mumbai)

Deployment scripts for the GigaTIME computational-pathology stack on Google Cloud.
**Review every script before running — nothing here is executed for you.**

## ⚠️ Two decisions baked into these scripts

1. **GPU: A100 → L4.** The original spec called for an **A100 40GB**. A100 is **not
   available in any Indian region**; in Asia it exists only in Tokyo/Seoul/Singapore
   (outside India). Because the clinical data has a **hard India data-residency
   requirement**, we use an **NVIDIA L4 24GB** in `asia-south1` (via the `g2`
   machine series) instead. Residency wins over GPU spec.
2. **Everything stays in `asia-south1` (Mumbai), single-region.** GPU VM, GCS bucket
   (single-region, *not* the `asia` multi-region), Artifact Registry, Cloud Run, and
   Cloud SQL (if used) are all pinned to India. No resource defaults to US/EU.

## Files

| File | Purpose |
|------|---------|
| `setup_infrastructure.sh` | One-time, **idempotent**: enable APIs, Artifact Registry repo, service accounts + IAM, GCS bucket (asia-south1), empty Secret Manager placeholders. Prints the manual secret/HMAC commands. |
| `deploy_backend.sh` | Build+push backend image, create the **Spot L4 GPU VM** with a startup script. |
| `backend_startup.sh` | Runs **on the VM** at boot: installs/verifies driver+Docker, pulls the image, fetches secrets from Secret Manager, brings up the stack. |
| `deploy_frontend.sh` | Build+push frontend image, deploy to **Cloud Run** (scale-to-zero). |
| `.env.example` | Every env var the backend/frontend expect, incl. the S3-vs-local storage fallback + Django branch snippet. |

## Run order

```bash
# 0. Confirm project + active account
gcloud config set project biostack-virtual-mif

# 1. One-time infrastructure (idempotent — safe to re-run)
./setup_infrastructure.sh

# 2. Populate secrets + create the GCS HMAC key (commands PRINTED by step 1).
#    e.g.:
gcloud storage hmac create gigatime-gcs-s3@biostack-virtual-mif.iam.gserviceaccount.com
printf '%s' 'MyDbPassword'  | gcloud secrets versions add gigatime-db-password   --data-file=-
printf '%s' 'HMAC_ACCESS_ID'| gcloud secrets versions add gigatime-s3-access-key --data-file=-
printf '%s' 'HMAC_SECRET'   | gcloud secrets versions add gigatime-s3-secret-key --data-file=-
python3 -c "import secrets;print(secrets.token_urlsafe(64))" \
                            | gcloud secrets versions add gigatime-django-secret-key --data-file=-
# Option B (default, self-hosted Redis): redis-url is redis://redis:6379/0
printf '%s' 'redis://redis:6379/0' | gcloud secrets versions add gigatime-redis-url --data-file=-

# 3. Backend GPU VM  (REQUIRES L4 quota — see below)
./deploy_backend.sh

# 4. Frontend on Cloud Run — point it at the backend VM's external IP
BACKEND_URL="http://<VM_EXTERNAL_IP>:8000" ./deploy_frontend.sh
```

## ⚠️ Quota you almost certainly must request first

`NVIDIA_L4_GPUS` in `asia-south1` is frequently **0** on a new project and is granted
**per region**. `deploy_backend.sh` will fail until it's raised.

```bash
gcloud compute regions describe asia-south1 --format="value(quotas)" | tr ';' '\n' | grep -i L4
# If the limit is 0: Console → IAM & Admin → Quotas → filter "NVIDIA_L4_GPUS",
# region = asia-south1 → Edit Quotas → request ≥ 1 (approval can take minutes–days).
```

Also check live zone capacity (switch `ZONE` if one is exhausted):
```bash
gcloud compute accelerator-types list \
  --filter="zone:( asia-south1-a asia-south1-b asia-south1-c )"
```

## Postgres / Redis — Option A vs B

- **Option B (default): self-hosted** Postgres + Redis as containers on the VM
  (mirrors the local docker-compose stack). Set `DEPLOY_MODE=selfhosted` (default).
- **Option A: managed** Cloud SQL + Memorystore. Set `DEPLOY_MODE=managed` and
  uncomment/wire the managed block in `backend_startup.sh` (+ supply `DB_HOST` and
  `gigatime-redis-url`). Both must be created in `asia-south1`.

## Spot resilience (read before relying on long runs)

The GPU VM is a **Spot** instance: GCP can reclaim it with **~30s notice**.
`--instance-termination-action=STOP` means it **stops** (disk + Postgres/Redis
volumes + `.env` survive) rather than being deleted — restart with
`gcloud compute instances start`. The pipeline uses **NoopScratch**: it writes no
scratch files and no OME-TIFF, and only emits the 21 marker percentages +
confidence scores per slide, writing the final result to the GCS bucket on slide
completion. So a Spot reclaim mid-slide simply means **that slide re-runs from the
start** — there is no scratch/OME-TIFF state to preserve or resume.

## Idle auto-stop (automatic compute cost control)

A systemd timer on the GPU VM (`gigatime-idle-stop.timer`, fires ~every
`IDLE_TIMER_INTERVAL`, default `2min`, first check 5 min after boot) runs a watcher
that asks Celery whether any task is **active, reserved, scheduled, or queued**
(via `python -m gigatime_backend.ops.idle_check` inside the worker container).
After a **continuous `IDLE_MINUTES`** (default `15`) with no work, the VM stops
**itself** (`gcloud compute instances stop <self> --zone <self-zone>`, name/zone
read from the metadata server) — so **compute billing pauses automatically** when
the pipeline is unused.

Safety:
- It stops **only** when active + reserved + scheduled + broker queue are all zero —
  never mid-batch.
- It **fails safe**: if it cannot confirm idleness (no worker replied, broker
  unreadable, inspect error) it treats the VM as busy and does **not** stop.
- A stop is safe by design: `--instance-termination-action=STOP` + NoopScratch
  means an in-flight slide simply re-runs on next start (no scratch/OME-TIFF state).

Tune via instance metadata in `deploy_backend.sh` (no need to edit the startup
script):
- `IDLE_MINUTES` — continuous idle before self-stop (default `15`).
- `IDLE_TIMER_INTERVAL` — how often the watcher checks (default `2min`).
- `WORKER_CONTAINER` — the Celery worker container/service the watcher `exec`s
  into to run the idle check. Leave empty to auto-resolve from the deploy mode
  (`DEPLOY_MODE`):
  `celery` (the compose service, Option B) or `gigatime-celery` (the `docker run`
  name, Option A). **Override only if you rename the worker** — a wrong name makes
  the check fail and (fail-safe) the VM never auto-stops.

The VM's runtime service account is bound the **built-in role
`roles/compute.instanceAdmin.v1`** (set up in `setup_infrastructure.sh`) so it can
stop/start itself. This is **broader** than the intended least-privilege custom
role (`compute.instances.stop`/`start`/`get` only) — that custom role needs
`roles/iam.roleAdmin`, which the deploying account does not currently have, so it
can be tightened back to the custom role once `roles/iam.roleAdmin` is available.

**Restart is manual** for now:
```bash
gcloud compute instances start gigatime-gpu --zone asia-south1-a   # re-runs the startup script
```
> Future option (NOT built): a Cloud Function triggered on slide submission could
> auto-START the VM. Left as a note only — no auto-start logic exists today.

> ⚠️ A **stopped** instance still bills for its **boot disk** while it exists.
> Only `gcloud compute instances delete` removes all charges.

## Stop / delete to avoid charges

```bash
# GPU VM (Spot bills while RUNNING; disk bills while it exists):
gcloud compute instances stop   gigatime-gpu --zone asia-south1-a   # pause compute billing
gcloud compute instances start  gigatime-gpu --zone asia-south1-a   # resume (re-runs startup)
gcloud compute instances delete gigatime-gpu --zone asia-south1-a   # full teardown

# Frontend (already scales to zero; delete to remove entirely):
gcloud run services delete gigatime-frontend --region asia-south1

# Optional cleanup:
gcloud artifacts repositories delete gigatime --location asia-south1
gcloud storage rm -r gs://gigatime-slides-mum     # DESTROYS stored slides — be sure
```

## Data-residency checklist

- [x] GPU VM — `asia-south1`
- [x] GCS bucket — `asia-south1` **single-region** (not `asia` multi-region)
- [x] Artifact Registry — `asia-south1`
- [x] Cloud Run frontend — `asia-south1`
- [x] Cloud SQL / Memorystore (if Option A) — create in `asia-south1`
- [x] Secret Manager payloads — pinned to `asia-south1` (India) via
      `--replication-policy=user-managed --locations=asia-south1` in
      `setup_infrastructure.sh` (not the default `automatic` replication).
