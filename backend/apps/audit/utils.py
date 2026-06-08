"""Helpers for recording audit-log entries.

Audit logging must never break the request it is observing, so every public
helper swallows its own exceptions.
"""

import logging

from .models import AuditLog

logger = logging.getLogger(__name__)


def _client_ip(request):
    """Best-effort client IP, honouring X-Forwarded-For behind a proxy."""
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        # The left-most entry is the original client.
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_action(
    user,
    action,
    resource_type,
    resource_id="",
    request=None,
    payload_snapshot=None,
    response_status=None,
):
    """Create an :class:`AuditLog` entry; never raises.

    Returns the created entry, or ``None`` if logging failed for any reason.
    """
    try:
        # A nullable FK rejects AnonymousUser, so only pass real, saved users.
        log_user = user if getattr(user, "is_authenticated", False) else None

        return AuditLog.objects.create(
            user=log_user,
            action=action,
            resource_type=resource_type,
            resource_id="" if resource_id is None else str(resource_id),
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "") if request else "",
            payload_snapshot=payload_snapshot or {},
            response_status=response_status,
        )
    except Exception:  # noqa: BLE001 — auditing must never break the request
        logger.exception("Failed to write audit log for action %s", action)
        return None
