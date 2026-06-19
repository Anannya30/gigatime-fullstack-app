import uuid

from django.conf import settings
from django.db import models


class SlideStatus(models.TextChoices):
    CREATED = "CREATED", "Created"
    QUEUED = "QUEUED", "Queued"
    RUNNING = "RUNNING", "Running"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"
    CANCELLED = "CANCELLED", "Cancelled"


# Statuses a slide can be stopped from -- i.e. still queued or in flight.
STOPPABLE_STATUSES = (
    SlideStatus.CREATED,
    SlideStatus.QUEUED,
    SlideStatus.RUNNING,
)


class ActiveSlideManager(models.Manager):
    """Default manager that hides soft-deleted slides."""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class Slide(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="slides",
    )

    filename = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    # Absolute path to the PNG on disk under ml/data/.
    file_path = models.CharField(max_length=500)
    file_size = models.BigIntegerField(null=True, blank=True)

    cancer_type = models.CharField(max_length=100, blank=True)
    tissue_origin = models.CharField(max_length=100, blank=True)
    cohort_id = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)

    status = models.CharField(
        max_length=20,
        choices=SlideStatus.choices,
        default=SlideStatus.CREATED,
    )

    # Microns-per-pixel actually used during inference, plus where it came from.
    # mpp_source is "metadata" when read from the slide (or a --mpp override) and
    # "assumed_default_0.25" when no metadata was found and the 40x default was
    # assumed -- so we can tell which slides ran on a real value vs a fallback.
    mpp_value = models.FloatField(null=True, blank=True)
    mpp_source = models.CharField(max_length=32, null=True, blank=True)

    submitted_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    # Live tile-processing progress, updated by the inference task while
    # status == RUNNING so the UI can render a "tiles processed" bar. tiles_total
    # is None until the slide is planned; tiles_done counts tiles streamed
    # (background-skipped tiles included, since they are still "processed").
    tiles_total = models.IntegerField(null=True, blank=True)
    tiles_done = models.IntegerField(default=0)

    # Set when the user asks to stop an in-flight slide. The running inference
    # task polls this at each progress checkpoint and aborts cooperatively,
    # marking the slide CANCELLED. (The stop endpoint also sets CANCELLED
    # immediately so orphaned RUNNING rows -- e.g. after a worker crash -- can
    # always be cleared even when no worker is alive to observe the flag.)
    stop_requested = models.BooleanField(default=False)

    # Soft delete bookkeeping.
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_slides",
    )

    # ``objects`` hides soft-deleted rows; ``all_objects`` sees everything.
    objects = ActiveSlideManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"{self.original_filename} ({self.status})"


class SlideResult(models.Model):
    slide = models.OneToOneField(
        Slide,
        on_delete=models.CASCADE,
        related_name="result",
    )
    # List of {"marker": str, "positive_pixel_pct": float,
    # "confidence_score": float} entries.
    marker_table = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Result for {self.slide_id}"
