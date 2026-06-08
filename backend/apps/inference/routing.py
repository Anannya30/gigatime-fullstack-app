"""WebSocket URL routing for the inference app."""

from django.urls import path

from .consumers import NotificationConsumer

websocket_urlpatterns = [
    path("ws/notifications/", NotificationConsumer.as_asgi()),
]
