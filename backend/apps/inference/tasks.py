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
)


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
            slide.save(update_fields=["status", "started_at"])

            # predict_slide() expects a Path (it reads png_path.name); wrap the
            # stored string path so it doesn't fail with "'str' object has no
            # attribute 'name'".
            binary_stack, prob_stack = predict_slide(
                model, Path(slide.file_path), device)
            marker_table = _build_marker_table(binary_stack, prob_stack)

            SlideResult.objects.create(slide=slide, marker_table=marker_table)

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
