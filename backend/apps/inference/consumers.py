"""WebSocket consumer for server-to-client slide notifications."""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def _user_from_token(raw_token):
    """Resolve the user for a JWT access token, or return None if invalid."""
    User = get_user_model()
    try:
        token = AccessToken(raw_token)
    except TokenError:
        return None
    user_id = token.get("user_id")
    if user_id is None:
        return None
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return None


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Per-user notification channel.

    Authenticates via ``?token=<jwt>`` on the connection URL and subscribes the
    socket to the ``user_<id>`` group. The server only pushes events down this
    socket; inbound messages are ignored.
    """

    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        raw_token = (query.get("token") or [None])[0]
        if not raw_token:
            await self.close()
            return

        user = await _user_from_token(raw_token)
        if user is None:
            await self.close()
            return

        self.user = user
        self.group_name = f"user_{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        group_name = getattr(self, "group_name", None)
        if group_name is not None:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Server-to-client only; ignore anything the client sends.
        return

    async def slide_complete(self, event):
        """Forward a ``slide.complete`` group event to the connected client."""
        await self.send_json(
            {
                "type": "slide.complete",
                "slide_id": event.get("slide_id"),
                "filename": event.get("filename"),
                "status": event.get("status"),
            }
        )

    async def slide_progress(self, event):
        """Forward a ``slide.progress`` group event (live tiles-processed updates
        for an in-flight slide) to the connected client."""
        await self.send_json(
            {
                "type": "slide.progress",
                "slide_id": event.get("slide_id"),
                "filename": event.get("filename"),
                "tiles_done": event.get("tiles_done"),
                "tiles_total": event.get("tiles_total"),
                "tiles_run": event.get("tiles_run"),
                "tiles_skipped": event.get("tiles_skipped"),
            }
        )
