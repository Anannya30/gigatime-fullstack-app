"""Celery application for the GigaTIME backend."""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "gigatime_backend.settings.development")

app = Celery("gigatime_backend")

# All Celery config keys are namespaced with CELERY_ in Django settings.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks.py modules in installed apps.
app.autodiscover_tasks()
