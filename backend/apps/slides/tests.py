import os
import shutil
import tempfile
import uuid

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Slide

User = get_user_model()

# Isolated media root so tests never write into the real ml/data/ directory.
TEMP_MEDIA = tempfile.mkdtemp(prefix="gigatime-slides-test-")

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def make_png(name="slide.png"):
    return SimpleUploadedFile(name, PNG_BYTES, content_type="image/png")


def tearDownModule():
    shutil.rmtree(TEMP_MEDIA, ignore_errors=True)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class SlideTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="owner@gigatime.org")
        self.other = User.objects.create_user(email="other@gigatime.org")

        self.list_url = reverse("slides:slide-list")
        self.upload_url = reverse("slides:slide-upload")
        self.batch_url = reverse("slides:slide-batch")

    def auth(self, user):
        access = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def detail_url(self, pk):
        return reverse("slides:slide-detail", kwargs={"pk": pk})

    def results_url(self, pk):
        return reverse("slides:slide-results", kwargs={"pk": pk})

    # --- uploads -----------------------------------------------------------
    def test_upload_single_slide(self):
        self.auth(self.user)
        resp = self.client.post(
            self.upload_url, {"file": make_png()}, format="multipart"
        )

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Slide.objects.count(), 1)

        slide = Slide.objects.get()
        self.assertEqual(slide.status, "CREATED")
        self.assertEqual(slide.owner, self.user)
        self.assertTrue(os.path.exists(slide.file_path))
        self.assertTrue(slide.file_path.startswith(TEMP_MEDIA))

    def test_upload_batch(self):
        self.auth(self.user)
        files = [make_png("a.png"), make_png("b.png"), make_png("c.png")]
        resp = self.client.post(self.batch_url, {"files": files}, format="multipart")

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(resp.data), 3)
        self.assertEqual(Slide.objects.filter(owner=self.user).count(), 3)

    # --- listing / ownership ----------------------------------------------
    def test_list_slides_own_only(self):
        self.auth(self.user)
        self.client.post(self.upload_url, {"file": make_png()}, format="multipart")

        self.auth(self.other)
        self.client.post(self.upload_url, {"file": make_png()}, format="multipart")

        # Each user sees only their own slide.
        self.auth(self.user)
        resp = self.client.get(self.list_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["owner"], self.user.id)

        self.auth(self.other)
        resp = self.client.get(self.list_url)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["owner"], self.other.id)

    # --- soft delete -------------------------------------------------------
    def test_soft_delete(self):
        self.auth(self.user)
        upload = self.client.post(
            self.upload_url, {"file": make_png()}, format="multipart"
        )
        pk = upload.data["id"]
        file_path = upload.data["file_path"]

        resp = self.client.delete(self.detail_url(pk))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        # Row still exists, flagged deleted, with bookkeeping set.
        slide = Slide.all_objects.get(pk=pk)
        self.assertTrue(slide.is_deleted)
        self.assertIsNotNone(slide.deleted_at)
        self.assertEqual(slide.deleted_by, self.user)

        # File is untouched on disk.
        self.assertTrue(os.path.exists(file_path))

        # No longer appears in the list.
        listing = self.client.get(self.list_url)
        self.assertEqual(len(listing.data), 0)

    # --- patch -------------------------------------------------------------
    def test_patch_metadata(self):
        self.auth(self.user)
        upload = self.client.post(
            self.upload_url, {"file": make_png()}, format="multipart"
        )
        pk = upload.data["id"]

        resp = self.client.patch(
            self.detail_url(pk), {"cancer_type": "melanoma"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["cancer_type"], "melanoma")
        self.assertEqual(Slide.objects.get(pk=pk).cancer_type, "melanoma")

    # --- results -----------------------------------------------------------
    def test_results_not_ready(self):
        self.auth(self.user)
        upload = self.client.post(
            self.upload_url, {"file": make_png()}, format="multipart"
        )
        pk = upload.data["id"]

        resp = self.client.get(self.results_url(pk))
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    # --- auth --------------------------------------------------------------
    def test_unauthenticated_blocked(self):
        self.client.credentials()  # clear any auth
        random_pk = uuid.uuid4()
        requests = [
            ("get", self.list_url),
            ("get", self.detail_url(random_pk)),
            ("post", self.upload_url),
            ("post", self.batch_url),
            ("patch", self.detail_url(random_pk)),
            ("delete", self.detail_url(random_pk)),
            ("get", self.results_url(random_pk)),
        ]
        for method, url in requests:
            resp = getattr(self.client, method)(url)
            self.assertEqual(
                resp.status_code,
                status.HTTP_401_UNAUTHORIZED,
                msg=f"{method.upper()} {url} should require auth",
            )
