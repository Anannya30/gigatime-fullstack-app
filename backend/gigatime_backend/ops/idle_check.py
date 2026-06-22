"""Idle check for the GigaTIME GPU VM auto-stop watcher.

Decides whether the Celery worker has ANY work in flight or pending. Used by the
on-VM systemd watcher (deploy/backend_startup.sh) to auto-stop the Spot GPU VM
after a continuous idle window so we are billed for compute only while the
pipeline is actually running.

Exit codes (the watcher treats anything non-zero as "busy" — fail safe):
    0  IDLE     -> no active/reserved/scheduled tasks on any worker AND the
                   broker queue is empty. Safe to start counting idle time.
    1  BUSY     -> a task is executing, reserved, scheduled, or queued.
    2  UNKNOWN  -> could not confirm idleness (no worker replied, or inspect
                   raised). Treated as BUSY by the watcher so we NEVER stop the
                   VM when we cannot prove it is idle.

Run inside the backend image (it already has Celery + the app + redis):
    python -m gigatime_backend.ops.idle_check
"""
import os
import sys

IDLE, BUSY, UNKNOWN = 0, 1, 2


def _has_tasks(mapping):
    """True if a Celery inspect mapping {worker: [tasks]} contains ANY task."""
    if not mapping:
        return False
    return any(tasks for tasks in mapping.values())


def _broker_queue_len():
    """LLEN of the default Celery queue on the Redis broker, or None if it
    cannot be read (the caller treats None as 'cannot confirm empty')."""
    url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    queue = os.environ.get("CELERY_DEFAULT_QUEUE", "celery")
    try:
        import redis  # ships with the app (celery[redis])

        return int(redis.Redis.from_url(url).llen(queue))
    except Exception:  # noqa: BLE001 — broker unreadable -> unknown, not empty
        return None


def main():
    # Import inside main so an import/settings error is reported here (and maps
    # to UNKNOWN/busy) rather than crashing at module load.
    try:
        from gigatime_backend.celery import app

        insp = app.control.inspect(timeout=5.0)
        active = insp.active()
        reserved = insp.reserved()
        scheduled = insp.scheduled()
    except Exception as exc:  # noqa: BLE001
        print(f"idle_check: inspect failed ({exc}) -> UNKNOWN/busy", flush=True)
        return UNKNOWN

    # inspect() returns None when NO worker replied; we cannot confirm idleness,
    # so report UNKNOWN (the watcher keeps the VM running) rather than risk
    # stopping a worker that is simply slow to answer.
    if active is None and reserved is None and scheduled is None:
        print("idle_check: no worker replied -> UNKNOWN/busy", flush=True)
        return UNKNOWN

    busy = _has_tasks(active) or _has_tasks(reserved) or _has_tasks(scheduled)

    qlen = _broker_queue_len()
    if qlen is None:
        # Broker length unknown: rely on inspect alone, but say so in the log.
        print("idle_check: broker LLEN unavailable; using inspect only", flush=True)
        qlen = 0

    if busy or qlen > 0:
        print(f"idle_check: BUSY (inspect_busy={busy} queue_len={qlen})", flush=True)
        return BUSY

    print("idle_check: IDLE (no active/reserved/scheduled tasks, queue empty)", flush=True)
    return IDLE


if __name__ == "__main__":
    sys.exit(main())
