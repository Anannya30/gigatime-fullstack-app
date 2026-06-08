"""
ASGI config for gigatime_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

HTTP requests are handled by Django's standard ASGI application; WebSocket
connections are routed through Django Channels to the inference consumers.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'gigatime_backend.settings.development')

# Initialise Django before importing anything that touches the app registry.
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from apps.inference.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    }
)
