"""Development settings for the GigaTIME backend."""

from .base import *  # noqa: F401,F403
from .base import env_list

# Always run with debugging on locally.
DEBUG = True

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0")

# Permissive CORS for local frontend development.
CORS_ALLOW_ALL_ORIGINS = True

# Verbose console logging during development.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
