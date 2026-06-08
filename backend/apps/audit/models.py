import uuid

from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Append-only record of a security-relevant action.

    Rows are immutable once written: updates and deletes are blocked at the
    model layer so the trail cannot be tampered with after the fact.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100)
    resource_type = models.CharField(max_length=100)
    resource_id = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    payload_snapshot = models.JSONField(default=dict)
    response_status = models.IntegerField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-timestamp"]
        verbose_name = "Audit Log"

    def __str__(self):
        return f"{self.action} on {self.resource_type} at {self.timestamp:%Y-%m-%d %H:%M:%S}"

    def save(self, *args, **kwargs):
        # Append-only: an existing pk means this is an update attempt.
        if self.pk is not None and AuditLog.objects.filter(pk=self.pk).exists():
            raise PermissionError("AuditLog entries are immutable and cannot be modified.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("AuditLog entries are append-only and cannot be deleted.")
