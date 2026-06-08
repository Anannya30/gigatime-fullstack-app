import shutil
import tempfile
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import AuditLog

User = get_user_model()

TEMP_MEDIA = tempfile.mkdtemp(prefix="gigatime-audit-test-")
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def make_png(name="slide.png"):
    return SimpleUploadedFile(name, PNG_BYTES, content_type="image/png")


def tearDownModule():
    shutil.rmtree(TEMP_MEDIA, ignore_errors=True)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class AuditLogTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="owner@gigatime.org")
        self.other = User.objects.create_user(email="other@gigatime.org")

        self.upload_url = reverse("slides:slide-upload")
        self.audit_url = reverse("audit:audit-list")
        self.login_url = reverse("accounts:google-login")

    def auth(self, user):
        access = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def detail_url(self, pk):
        return reverse("slides:slide-detail", kwargs={"pk": pk})

    # --- entries written by instrumented views -----------------------------
    def test_audit_log_created_on_upload(self):
        self.auth(self.user)
        resp = self.client.post(
            self.upload_url, {"file": make_png()}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        log = AuditLog.objects.get(action="slide.upload")
        self.assertEqual(log.resource_type, "Slide")
        self.assertEqual(log.resource_id, resp.data["id"])
        self.assertEqual(log.user, self.user)
        self.assertEqual(log.response_status, status.HTTP_201_CREATED)

    def test_audit_log_created_on_delete(self):
        self.auth(self.user)
        upload = self.client.post(
            self.upload_url, {"file": make_png()}, format="multipart"
        )
        pk = upload.data["id"]

        resp = self.client.delete(self.detail_url(pk))
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        log = AuditLog.objects.get(action="slide.delete")
        self.assertEqual(log.resource_type, "Slide")
        self.assertEqual(log.resource_id, str(pk))

    @patch("apps.accounts.views.requests.get")
    def test_audit_log_created_on_login(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "email": "newuser@gigatime.org",
            "given_name": "New",
            "family_name": "User",
            "sub": "google-123",
        }
        mock_get.return_value = mock_resp

        resp = self.client.post(
            self.login_url, {"credential": "fake-id-token"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        log = AuditLog.objects.get(action="auth.google_login")
        self.assertEqual(log.resource_type, "User")
        self.assertEqual(log.user.email, "newuser@gigatime.org")

    # --- list endpoint -----------------------------------------------------
    def test_audit_log_list(self):
        self.auth(self.user)
        self.client.post(self.upload_url, {"file": make_png()}, format="multipart")

        resp = self.client.get(self.audit_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Paginated response: results + count.
        self.assertIn("results", resp.data)
        self.assertGreaterEqual(resp.data["count"], 1)
        actions = {row["action"] for row in resp.data["results"]}
        self.assertIn("slide.upload", actions)

    def test_audit_log_filter_by_action(self):
        AuditLog.objects.create(
            user=self.user, action="slide.upload", resource_type="Slide"
        )
        AuditLog.objects.create(
            user=self.user, action="slide.delete", resource_type="Slide"
        )

        self.auth(self.user)
        resp = self.client.get(self.audit_url, {"action": "slide.upload"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["action"], "slide.upload")

    def test_audit_log_requires_auth(self):
        resp = self.client.get(self.audit_url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- immutability ------------------------------------------------------
    def test_audit_log_immutable(self):
        log = AuditLog.objects.create(
            user=self.user, action="slide.upload", resource_type="Slide"
        )
        log.action = "tampered"
        with self.assertRaises(PermissionError):
            log.save()
