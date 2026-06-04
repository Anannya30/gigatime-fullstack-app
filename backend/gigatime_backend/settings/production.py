"""Production settings for the GigaTIME backend."""

from .base import *  # noqa: F401,F403
from .base import env_list

DEBUG = False

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")

# Security hardening — terminate TLS at the proxy and trust forwarded headers.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
