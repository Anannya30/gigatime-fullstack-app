"""Celery tasks for running GigaTIME inference over a batch of slides."""

import sys
from pathlib import Path

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone

from apps.slides.models import SlideResult, SlideStatus

from .models import BatchJob, BatchJobStatus

# Make the ML pipeline importable. The inference code lives at
# <repo>/ml/scripts/run_png_inference.py and is shared with the CLI tooling.
_ML_SCRIPTS = str((settings.REPO_ROOT / "ml" / "scripts").resolve())
if _ML_SCRIPTS not in sys.path:
    sys.path.insert(0, _ML_SCRIPTS)

# Imported at module level so tests can patch ``apps.inference.tasks.load_model``
# and ``apps.inference.tasks.predict_slide``.
from run_png_inference import (  # noqa: E402
    BACKGROUND_CHANNELS,
    CHANNEL_NAMES,
    load_model,
    predict_slide,
    write_ome_tiff,
)

# Whole-slide formats are streamed tile-by-tile via OpenSlide (run_wsi_inference)
# instead of being loaded whole into RAM like a PNG. run_wsi_inference imports
# openslide at module load, so it is imported lazily inside the task -- a missing
# OpenSlide install then only affects WSI slides, not the PNG path or test import.
WSI_EXTENSIONS = {".tif", ".tiff", ".svs", ".ndpi", ".scn", ".mrxs", ".vms",
                  ".vmu", ".bif"}

# How often (in tiles) the WSI path persists progress + pushes a ws event.
PROGRESS_EVERY_TILES = 500


def _build_marker_table(binary_stack, prob_stack):
    """Build [{marker, positive_pixel_pct, confidence_score}] for the 21 analysis
    channels.

    ``binary_stack`` is the [23, H, W] uint8 sigmoid > 0.5 prediction and
    ``prob_stack`` is the matching [23, H, W] float32 raw sigmoid probabilities,
    both from ``predict_slide``; the two background channels (TRITC, Cy5) are
    dropped. ``confidence_score`` is the mean raw probability over the marker's
    positive pixels (0.0 when there are none).
    """
    h, w = binary_stack.shape[1], binary_stack.shape[2]
    total = h * w
    table = []
    for idx, name in enumerate(CHANNEL_NAMES):
        if name in BACKGROUND_CHANNELS:
            continue
        mask = binary_stack[idx] == 1
        positive = int(mask.sum())
        pct = round(positive / total * 100.0, 2) if total else 0.0
        if positive:
            confidence = round(float(prob_stack[idx][mask].mean()), 4)
        else:
            confidence = 0.0
        table.append({
            "marker": name,
            "positive_pixel_pct": pct,
            "confidence_score": confidence,
        })
    return table


def _wsi_marker_table(results):
    """Convert a run_wsi_inference results dict to the SlideResult marker_table
    shape the frontend consumes: [{marker, positive_pixel_pct, confidence_score,
    ...}]. ``confidence_score`` uses mean_sigmoid_positive so it carries the same
    "mean probability on positive pixels" meaning as the PNG path; the honest
    per-slide mean_sigmoid_tissue and the paper's Pearson are preserved too."""
    table = []
    for m in results["markers"]:
        table.append({
            "marker": m["name"],
            "positive_pixel_pct": round(float(m["positive_pixel_pct"]), 2),
            "confidence_score": (round(float(m["mean_sigmoid_positive"]), 4)
                                 if m.get("mean_sigmoid_positive") is not None
                                 else 0.0),
            "mean_sigmoid_tissue": m.get("mean_sigmoid_tissue"),
            "paper_pearson": m.get("paper_pearson"),
        })
    return table


def _notify(user_id, slide, status):
    """Push a slide-complete event to the owner's personal channel group."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        f"user_{user_id}",
        {
            "type": "slide.complete",
            "slide_id": str(slide.id),
            "filename": slide.filename,
            "status": status,
        },
    )


def _notify_progress(user_id, slide, done, total, n_run, n_skip):
    """Push a live ``slide.progress`` event (tiles processed) to the owner."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        f"user_{user_id}",
        {
            "type": "slide.progress",
            "slide_id": str(slide.id),
            "filename": slide.filename,
            "tiles_done": done,
            "tiles_total": total,
            "tiles_run": n_run,
            "tiles_skipped": n_skip,
        },
    )


def _run_wsi_slide(slide, model, device, owner_id):
    """Stream-infer one whole-slide image, persisting + broadcasting tile progress
    as it goes. Returns (marker_table, tiff_path)."""
    from run_wsi_inference import infer_slide  # lazy: needs OpenSlide

    src = Path(slide.file_path)
    tiff_path = src.parent / (src.stem + "_pred.ome.tiff")

    def progress_cb(done, total, n_run, n_skip):
        # A progress write must never abort a multi-hour inference; swallow any
        # transient DB / channel-layer error and let the next tick catch up.
        try:
            slide.tiles_done = done
            slide.tiles_total = total
            slide.save(update_fields=["tiles_done", "tiles_total"])
            _notify_progress(owner_id, slide, done, total, n_run, n_skip)
        except Exception:  # noqa: BLE001 — progress is best-effort
            pass

    results = infer_slide(
        src, tiff_path, model, device,
        bg_skip=True, progress_cb=progress_cb, quiet=True)

    # Persist the MPP actually used during inference (and whether it came from
    # slide metadata or the assumed 40x default) onto the Slide record.
    slide.mpp_value = results["native_mpp"]
    slide.mpp_source = results["mpp_source"]
    slide.save(update_fields=["mpp_value", "mpp_source"])

    return _wsi_marker_table(results), tiff_path


@shared_task
def run_batch_inference(batch_job_id):
    """Run GigaTIME inference on every slide in a batch, in sequence."""
    import torch

    batch_job = BatchJob.objects.get(id=batch_job_id)
    batch_job.status = BatchJobStatus.RUNNING
    batch_job.save(update_fields=["status"])

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device)

    failed = False
    for slide in batch_job.slides.all():
        try:
            slide.status = SlideStatus.RUNNING
            slide.started_at = timezone.now()
            slide.tiles_done = 0
            slide.tiles_total = None
            slide.save(update_fields=["status", "started_at",
                                      "tiles_done", "tiles_total"])

            ext = Path(slide.file_path).suffix.lower()
            if ext in WSI_EXTENSIONS:
                # Whole-slide image: stream tiles via OpenSlide with live
                # tiles-processed progress. Writes its own OME-TIFF.
                marker_table, _tiff_path = _run_wsi_slide(
                    slide, model, device, batch_job.owner_id)
            else:
                # PNG path: predict_slide() expects a Path (it reads
                # png_path.name); wrap the stored string path so it doesn't fail
                # with "'str' object has no attribute 'name'".
                binary_stack, prob_stack = predict_slide(
                    model, Path(slide.file_path), device)
                marker_table = _build_marker_table(binary_stack, prob_stack)

                # OME-TIFF next to the source image: <stem>_pred.ome.tiff.
                tiff_path = Path(slide.file_path).with_suffix("").parent / (
                    Path(slide.file_path).stem + "_pred.ome.tiff"
                )
                write_ome_tiff(tiff_path, binary_stack)

            # update_or_create so re-running a slide replaces its result instead
            # of raising on the OneToOne unique constraint.
            SlideResult.objects.update_or_create(
                slide=slide, defaults={"marker_table": marker_table})

            slide.status = SlideStatus.COMPLETED
            slide.completed_at = timezone.now()
            slide.save(update_fields=["status", "completed_at"])

            _notify(batch_job.owner_id, slide, SlideStatus.COMPLETED)
        except Exception as exc:  # noqa: BLE001 — surface any failure on the job
            failed = True
            slide.status = SlideStatus.FAILED
            slide.error_message = str(exc)
            slide.save(update_fields=["status", "error_message"])

            batch_job.status = BatchJobStatus.FAILED
            batch_job.error_message = str(exc)
            batch_job.completed_at = timezone.now()
            batch_job.save(
                update_fields=["status", "error_message", "completed_at"]
            )

            _notify(batch_job.owner_id, slide, SlideStatus.FAILED)

    if not failed:
        batch_job.status = BatchJobStatus.COMPLETED
        batch_job.completed_at = timezone.now()
        batch_job.save(update_fields=["status", "completed_at"])

    return str(batch_job.id)
