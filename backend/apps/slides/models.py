import uuid

from django.conf import settings
from django.db import models


class SlideStatus(models.TextChoices):
    CREATED = "CREATED", "Created"
    QUEUED = "QUEUED", "Queued"
    RUNNING = "RUNNING", "Running"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


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

    submitted_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

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
