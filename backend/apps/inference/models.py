import uuid

from django.conf import settings
from django.db import models


class BatchJobStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    RUNNING = "RUNNING", "Running"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


class BatchJob(models.Model):
    """A batch of slides submitted together for GigaTIME inference."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="batch_jobs",
    )
    slides = models.ManyToManyField("slides.Slide", related_name="batch_jobs")

    status = models.CharField(
        max_length=20,
        choices=BatchJobStatus.choices,
        default=BatchJobStatus.PENDING,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"BatchJob {self.id} ({self.status})"
