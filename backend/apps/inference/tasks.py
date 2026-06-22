"""Celery tasks for running GigaTIME inference over a batch of slides."""

import logging
import sys
from pathlib import Path

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.conf import settings
from django.core.mail import send_mail
from django.db import InterfaceError, OperationalError, close_old_connections
from django.utils import timezone

logger = logging.getLogger(__name__)

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
)

# Whole-slide formats are streamed tile-by-tile via OpenSlide (run_wsi_inference)
# instead of being loaded whole into RAM like a PNG. run_wsi_inference imports
# openslide at module load, so it is imported lazily inside the task -- a missing
# OpenSlide install then only affects WSI slides, not the PNG path or test import.
WSI_EXTENSIONS = {".tif", ".tiff", ".svs", ".ndpi", ".scn", ".mrxs", ".vms",
                  ".vmu", ".bif"}

# How often (in tiles) the WSI path persists progress + pushes a ws event.
PROGRESS_EVERY_TILES = 500


class SlideCancelled(Exception):
    """Raised inside the WSI progress callback when the user requested a stop,
    so the streaming inference unwinds and the slide is marked CANCELLED rather
    than FAILED. Carries no payload -- the task handles the bookkeeping."""


def _save_fields(obj, **fields):
    """Persist ``fields`` on a model instance from inside a long-running task,
    reconnecting if the DB connection was dropped mid-run.

    A multi-hour inference holds one Postgres connection across thousands of
    writes; if the server or network drops it, every later ``save()`` raises
    ``InterfaceError: connection already closed`` -- including the error
    handler's own status write, which is why a crashed run gets stuck at
    RUNNING. ``close_old_connections()`` drops the dead/obsolete connection
    (Django reopens a fresh one on next use); retrying once makes the critical
    status writes survive a dropped connection.
    """
    for key, value in fields.items():
        setattr(obj, key, value)
    update_fields = list(fields.keys())
    for attempt in (1, 2):
        try:
            close_old_connections()
            obj.save(update_fields=update_fields)
            return
        except (InterfaceError, OperationalError):
            close_old_connections()
            if attempt == 2:
                raise


def _stop_requested(slide):
    """Re-read the slide's stop flag, tolerating a dropped connection. Returns
    False (keep going) if the read fails transiently, so a connection blip never
    aborts an otherwise-healthy run."""
    for attempt in (1, 2):
        try:
            close_old_connections()
            slide.refresh_from_db(fields=["stop_requested"])
            return slide.stop_requested
        except (InterfaceError, OperationalError):
            close_old_connections()
            if attempt == 2:
                return False


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


def _notify_email(owner, slide, status):
    """Email the slide owner when processing reaches a terminal state (COMPLETED
    or FAILED), over the same SMTP backend the OTP/2FA emails use.

    Best-effort: a mail/SMTP failure must never fail the inference task or get
    the slide stuck, so every error is caught and logged -- the bell/websocket
    notification (_notify) still fires regardless. No email is sent for a
    user-initiated CANCELLED, since the user already knows they stopped it.
    """
    email = getattr(owner, "email", None)
    if not email:
        return
    if status == SlideStatus.COMPLETED:
        subject = f'biostack-mIF — "{slide.filename}" processing complete'
        body = (
            f'Good news — processing of your slide "{slide.filename}" is '
            f"complete.\n\n"
            f"The 21 predicted marker-channel percentages are ready to view in "
            f"biostack-mIF under My Slides.\n\n"
            f"— biostack-mIF (research use only; not for clinical diagnosis)"
        )
    elif status == SlideStatus.FAILED:
        subject = f'biostack-mIF — "{slide.filename}" processing failed'
        body = (
            f'Unfortunately, processing of your slide "{slide.filename}" '
            f"failed.\n\n"
            f"Reason: {slide.error_message or 'unknown error'}\n\n"
            f"You can retry it from My Slides in biostack-mIF.\n\n"
            f"— biostack-mIF (research use only; not for clinical diagnosis)"
        )
    else:
        return
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    except Exception:  # noqa: BLE001 — email is best-effort, never fail the job
        logger.warning("Failed to send %s email for slide %s to %s",
                       status, slide.id, email, exc_info=True)


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
    as it goes. Returns the marker_table.

    Uses percentages_only.infer_percentages: it reuses run_wsi_inference's tiling
    and accumulation EXACTLY but skips the OME-TIFF and the multi-GB scratch
    memmap (the overlay is no longer offered for download, and the percentages
    are all the product needs). run_wsi_inference.infer_slide is left untouched
    so the original OME-TIFF pipeline remains available as a fallback."""
    from percentages_only import infer_percentages  # lazy: needs OpenSlide

    src = Path(slide.file_path)
    # Keep the tiny results.json next to the slide under the same name the
    # restore_slide recovery command expects, even though no OME-TIFF is written.
    json_path = str(src.parent / (src.stem + "_pred.ome.tiff.results.json"))

    def progress_cb(done, total, n_run, n_skip):
        # Cooperative cancellation checkpoint: if the user asked to stop this
        # slide while it was streaming, abort now so the task can mark it
        # CANCELLED. This is checked *before* the best-effort progress write so
        # the swallow below can never hide the cancellation.
        if _stop_requested(slide):
            raise SlideCancelled()

        # A progress write must never abort a multi-hour inference; swallow any
        # transient DB / channel-layer error and let the next tick catch up.
        # _save_fields reconnects if the long-lived connection was dropped, so a
        # blip here doesn't poison every later write.
        try:
            _save_fields(slide, tiles_done=done, tiles_total=total)
            _notify_progress(owner_id, slide, done, total, n_run, n_skip)
        except Exception:  # noqa: BLE001 — progress is best-effort
            pass

    results = infer_percentages(
        src, model, device, bg_skip=True, progress_cb=progress_cb,
        json_path=json_path, write_json=True, quiet=True)

    # Persist the MPP actually used during inference (and whether it came from
    # slide metadata or the assumed 40x default) onto the Slide record.
    _save_fields(slide, mpp_value=results["native_mpp"],
                 mpp_source=results["mpp_source"])

    return _wsi_marker_table(results)


@shared_task
def run_batch_inference(batch_job_id):
    """Run GigaTIME inference on every slide in a batch, in sequence."""
    import torch

    batch_job = BatchJob.objects.get(id=batch_job_id)
    # Load the owner once up front (fresh connection) so the per-slide completion
    # email can read owner.email without a late DB query on a possibly-dropped
    # connection after a multi-hour run.
    owner = batch_job.owner
    _save_fields(batch_job, status=BatchJobStatus.RUNNING)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(device)

    failed = False
    for slide in batch_job.slides.all():
        # Honor a stop requested before this slide ever started running (e.g.
        # the user cancelled a queued slide while an earlier one was streaming).
        if _stop_requested(slide) or slide.status == SlideStatus.CANCELLED:
            _save_fields(slide, status=SlideStatus.CANCELLED,
                         stop_requested=False, completed_at=timezone.now())
            _notify(batch_job.owner_id, slide, SlideStatus.CANCELLED)
            continue
        try:
            _save_fields(slide, status=SlideStatus.RUNNING,
                         started_at=timezone.now(), tiles_done=0,
                         tiles_total=None)

            ext = Path(slide.file_path).suffix.lower()
            if ext in WSI_EXTENSIONS:
                # Whole-slide image: stream tiles via OpenSlide with live
                # tiles-processed progress. Computes the 21 marker percentages
                # only -- no OME-TIFF, no scratch memmap.
                marker_table = _run_wsi_slide(
                    slide, model, device, batch_job.owner_id)
            else:
                # PNG path: predict_slide() expects a Path (it reads
                # png_path.name); wrap the stored string path so it doesn't fail
                # with "'str' object has no attribute 'name'". We keep only the
                # 21 marker percentages -- the OME-TIFF overlay is no longer
                # produced (it was a pure byproduct and is not offered anymore).
                binary_stack, prob_stack = predict_slide(
                    model, Path(slide.file_path), device)
                marker_table = _build_marker_table(binary_stack, prob_stack)

            # update_or_create so re-running a slide replaces its result instead
            # of raising on the OneToOne unique constraint. Reconnect first in
            # case the long inference outlived the original DB connection.
            close_old_connections()
            SlideResult.objects.update_or_create(
                slide=slide, defaults={"marker_table": marker_table})

            _save_fields(slide, status=SlideStatus.COMPLETED,
                         completed_at=timezone.now())

            _notify(batch_job.owner_id, slide, SlideStatus.COMPLETED)
            _notify_email(owner, slide, SlideStatus.COMPLETED)
        except SlideCancelled:
            # User-requested stop -- mark CANCELLED (not FAILED) and leave the
            # rest of the batch running.
            _save_fields(slide, status=SlideStatus.CANCELLED,
                         stop_requested=False, completed_at=timezone.now(),
                         error_message="Cancelled by user.")
            _notify(batch_job.owner_id, slide, SlideStatus.CANCELLED)
        except Exception as exc:  # noqa: BLE001 — surface any failure on the job
            failed = True
            # _save_fields reconnects, so the FAILED status is recorded even when
            # the failure was itself a dropped DB connection -- the slide no
            # longer gets stuck at RUNNING.
            _save_fields(slide, status=SlideStatus.FAILED,
                         error_message=str(exc))
            _save_fields(batch_job, status=BatchJobStatus.FAILED,
                         error_message=str(exc), completed_at=timezone.now())

            _notify(batch_job.owner_id, slide, SlideStatus.FAILED)
            _notify_email(owner, slide, SlideStatus.FAILED)

    if not failed:
        _save_fields(batch_job, status=BatchJobStatus.COMPLETED,
                     completed_at=timezone.now())

    return str(batch_job.id)
