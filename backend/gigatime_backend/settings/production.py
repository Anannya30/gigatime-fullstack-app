"""Production settings for the GigaTIME backend.

Inherits everything from ``base.py`` (which already reads the database and
Redis configuration from the environment) and layers on production hardening.
Intended to run behind the NGINX reverse proxy defined in docker-compose.yml.
"""

from .base import *  # noqa: F401,F403
from .base import env_list

DEBUG = False

# Hosts are supplied via the ALLOWED_HOSTS env var; defaults cover the
# docker-compose service names and localhost so the stack runs out of the box.
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,backend,nginx")

# TLS is terminated at the NGINX proxy; trust its forwarded protocol header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Collected static files live here inside the container image.
STATIC_ROOT = "/app/staticfiles"

# Database and Redis settings are inherited from base.py and read from the
# environment (DB_NAME/DB_USER/DB_PASSWORD/DB_HOST/DB_PORT and REDIS_URL),
# overridden per-service in docker-compose.yml
# (DB_HOST=db, REDIS_URL=redis://redis:6379/0).
