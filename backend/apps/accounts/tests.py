from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User


def _google_payload(**overrides):
    """A representative Google tokeninfo response body."""
    payload = {
        "sub": "1234567890",
        "email": "researcher@gigatime.org",
        "email_verified": "true",
        "given_name": "Ada",
        "family_name": "Lovelace",
        "picture": "https://example.com/avatar.png",
        "aud": "test-client-id",
    }
    payload.update(overrides)
    return payload


class _FakeResponse:
    """Minimal stand-in for a ``requests.Response``."""

    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def json(self):
        return self._json


class GoogleLoginTests(APITestCase):
    def setUp(self):
        self.url = reverse("accounts:google-login")

    @patch("apps.accounts.views.requests.get")
    def test_google_login_creates_user(self, mock_get):
        mock_get.return_value = _FakeResponse(_google_payload())

        resp = self.client.post(self.url, {"credential": "fake-id-token"}, format="json")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["user"]["email"], "researcher@gigatime.org")

        self.assertEqual(User.objects.count(), 1)
        user = User.objects.get(email="researcher@gigatime.org")
        self.assertEqual(user.google_id, "1234567890")
        self.assertEqual(user.avatar_url, "https://example.com/avatar.png")
        self.assertTrue(user.is_email_verified)
        self.assertEqual(user.first_name, "Ada")

    @patch("apps.accounts.views.requests.get")
    def test_google_login_existing_user(self, mock_get):
        mock_get.return_value = _FakeResponse(_google_payload())

        first = self.client.post(self.url, {"credential": "fake-id-token"}, format="json")
        second = self.client.post(self.url, {"credential": "fake-id-token"}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(User.objects.filter(email="researcher@gigatime.org").count(), 1)
        self.assertEqual(User.objects.count(), 1)


class MeViewTests(APITestCase):
    def setUp(self):
        self.url = reverse("accounts:me")
        self.user = User.objects.create_user(
            email="researcher@gigatime.org",
            first_name="Ada",
            last_name="Lovelace",
            lab_name="Babbage Lab",
        )

    def test_me_requires_auth(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_user(self):
        access = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["email"], "researcher@gigatime.org")
        self.assertEqual(resp.data["first_name"], "Ada")
        self.assertEqual(resp.data["lab_name"], "Babbage Lab")


class RefreshTokenTests(APITestCase):
    def setUp(self):
        self.url = reverse("accounts:token-refresh")
        self.user = User.objects.create_user(email="researcher@gigatime.org")

    def test_refresh_token(self):
        refresh = str(RefreshToken.for_user(self.user))

        resp = self.client.post(self.url, {"refresh": refresh}, format="json")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
