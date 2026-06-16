from unittest.mock import MagicMock, patch

import numpy as np
from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.slides.models import Slide, SlideResult, SlideStatus
from gigatime_backend.asgi import application

from .models import BatchJob, BatchJobStatus

User = get_user_model()

# A 23-channel binary prediction stack with a known number of positive pixels,
# plus the matching raw-probability stack. predict_slide returns the pair
# (binary_stack, prob_stack), so the mock must return both.
FAKE_PRED = np.zeros((23, 16, 16), dtype=np.uint8)
FAKE_PRED[3, :8, :] = 1  # 50% positive on the PD-1 channel
FAKE_PROB = np.zeros((23, 16, 16), dtype=np.float32)

IN_MEMORY_CHANNELS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
}


def make_slide(owner, name="slide.png"):
    return Slide.objects.create(
        owner=owner,
        filename=name,
        original_filename=name,
        file_path=f"/tmp/{name}",
        status=SlideStatus.CREATED,
    )


def auth_header(client, user):
    access = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")


class BatchJobApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="owner@gigatime.org")
        self.other = User.objects.create_user(email="other@gigatime.org")
        self.create_url = reverse("inference:batch-create")

    def status_url(self, pk):
        return reverse("inference:batch-status", kwargs={"pk": pk})

    @patch("apps.inference.views.run_batch_inference.delay")
    def test_create_batch_job(self, mock_delay):
        auth_header(self.client, self.user)
        s1 = make_slide(self.user, "a.png")
        s2 = make_slide(self.user, "b.png")

        resp = self.client.post(
            self.create_url,
            {"slides": [str(s1.id), str(s2.id)]},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(BatchJob.objects.count(), 1)
        batch = BatchJob.objects.get()
        self.assertEqual(batch.owner, self.user)
        self.assertEqual(batch.slides.count(), 2)
        self.assertEqual(resp.data["status"], BatchJobStatus.PENDING)

        # Task was enqueued exactly once with the new batch id.
        mock_delay.assert_called_once_with(str(batch.id))

    @patch("apps.inference.views.run_batch_inference.delay")
    def test_create_batch_rejects_unowned_slide(self, mock_delay):
        auth_header(self.client, self.user)
        foreign = make_slide(self.other, "x.png")

        resp = self.client.post(
            self.create_url, {"slides": [str(foreign.id)]}, format="json"
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(BatchJob.objects.count(), 0)
        mock_delay.assert_not_called()

    def test_batch_status(self):
        auth_header(self.client, self.user)
        slide = make_slide(self.user, "a.png")
        batch = BatchJob.objects.create(
            owner=self.user, status=BatchJobStatus.RUNNING
        )
        batch.slides.set([slide])

        resp = self.client.get(self.status_url(batch.id))

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], BatchJobStatus.RUNNING)
        self.assertEqual(len(resp.data["slides"]), 1)
        self.assertEqual(resp.data["slides"][0]["status"], SlideStatus.CREATED)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
    CHANNEL_LAYERS=IN_MEMORY_CHANNELS,
)
class RunBatchInferenceTaskTests(TransactionTestCase):
    def test_task_marks_slides_complete(self):
        from .tasks import run_batch_inference

        user = User.objects.create_user(email="task@gigatime.org")
        slide = make_slide(user, "a.png")
        batch = BatchJob.objects.create(owner=user)
        batch.slides.set([slide])

        with patch("apps.inference.tasks.load_model", return_value=MagicMock()), \
                patch("apps.inference.tasks.predict_slide",
                      return_value=(FAKE_PRED, FAKE_PROB)):
            run_batch_inference.delay(str(batch.id))

        slide.refresh_from_db()
        batch.refresh_from_db()

        self.assertEqual(slide.status, SlideStatus.COMPLETED)
        self.assertIsNotNone(slide.completed_at)
        self.assertEqual(batch.status, BatchJobStatus.COMPLETED)

        result = SlideResult.objects.get(slide=slide)
        markers = {row["marker"] for row in result.marker_table}
        # 21 analysis channels (TRITC + Cy5 background channels dropped).
        self.assertEqual(len(result.marker_table), 21)
        self.assertNotIn("TRITC", markers)
        pd1 = next(r for r in result.marker_table if r["marker"] == "PD-1")
        self.assertEqual(pd1["positive_pixel_pct"], 50.0)


@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
class NotificationConsumerTests(TransactionTestCase):
    def test_websocket_connect(self):
        user = User.objects.create_user(email="ws@gigatime.org")
        token = str(RefreshToken.for_user(user).access_token)

        async def run():
            communicator = WebsocketCommunicator(
                application, f"/ws/notifications/?token={token}"
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)
            await communicator.disconnect()

        async_to_sync(run)()

    def test_websocket_rejects_missing_token(self):
        async def run():
            communicator = WebsocketCommunicator(
                application, "/ws/notifications/"
            )
            connected, _ = await communicator.connect()
            self.assertFalse(connected)

        async_to_sync(run)()
