from datetime import timedelta
from unittest.mock import patch

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OTPToken, User


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


class RegisterTests(APITestCase):
    def setUp(self):
        self.url = reverse("accounts:register")
        self.payload = {
            "email": "newuser@gigatime.org",
            "password": "supersecret",
            "first_name": "Grace",
            "last_name": "Hopper",
            "lab_name": "Navy Lab",
        }

    @patch("apps.accounts.views.send_mail")
    def test_register_success(self, mock_send_mail):
        resp = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["message"], "Account created. You can now sign in.")
        mock_send_mail.assert_called_once()

        self.assertTrue(User.objects.filter(email="newuser@gigatime.org").exists())
        user = User.objects.get(email="newuser@gigatime.org")
        self.assertTrue(user.check_password("supersecret"))
        self.assertFalse(user.is_email_verified)
        self.assertEqual(user.first_name, "Grace")
        self.assertEqual(user.lab_name, "Navy Lab")

    @patch("apps.accounts.views.send_mail")
    def test_register_duplicate_email(self, mock_send_mail):
        first = self.client.post(self.url, self.payload, format="json")
        second = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second.data["detail"], "Email already registered")
        self.assertEqual(User.objects.filter(email="newuser@gigatime.org").count(), 1)

    @patch("apps.accounts.views.send_mail")
    def test_register_short_password(self, mock_send_mail):
        payload = {**self.payload, "password": "short"}
        resp = self.client.post(self.url, payload, format="json")

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["detail"], "Password must be at least 8 characters")
        self.assertFalse(User.objects.filter(email="newuser@gigatime.org").exists())
        mock_send_mail.assert_not_called()


class EmailPasswordLoginTests(APITestCase):
    def setUp(self):
        self.url = reverse("accounts:email-login")
        self.user = User.objects.create_user(
            email="researcher@gigatime.org",
            password="correct-horse",
            first_name="Ada",
            lab_name="Babbage Lab",
        )

    def test_login_wrong_password(self):
        resp = self.client.post(
            self.url,
            {"email": "researcher@gigatime.org", "password": "wrong"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(resp.data["detail"], "Invalid credentials")

    @patch("apps.accounts.views.send_mail")
    def test_login_correct_sends_otp(self, mock_send_mail):
        resp = self.client.post(
            self.url,
            {"email": "researcher@gigatime.org", "password": "correct-horse"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["otp_required"])
        self.assertIn("session_token", resp.data)
        mock_send_mail.assert_called_once()

        otp_token = OTPToken.objects.get(session_token=resp.data["session_token"])
        self.assertEqual(otp_token.user, self.user)
        self.assertFalse(otp_token.is_used)


class OTPVerifyTests(APITestCase):
    def setUp(self):
        self.url = reverse("accounts:verify-otp")
        self.user = User.objects.create_user(
            email="researcher@gigatime.org",
            password="correct-horse",
        )
        self.otp = OTPToken.objects.create(
            user=self.user,
            token="123456",
            session_token="session-abc",
            expires_at=timezone.now() + timedelta(minutes=10),
        )

    def test_verify_otp_correct(self):
        resp = self.client.post(
            self.url,
            {"session_token": "session-abc", "otp": "123456"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["user"]["email"], "researcher@gigatime.org")

        self.otp.refresh_from_db()
        self.assertTrue(self.otp.is_used)

    def test_verify_otp_wrong(self):
        resp = self.client.post(
            self.url,
            {"session_token": "session-abc", "otp": "000000"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["detail"], "Invalid OTP")

    def test_verify_otp_expired(self):
        self.otp.expires_at = timezone.now() - timedelta(minutes=1)
        self.otp.save(update_fields=["expires_at"])

        resp = self.client.post(
            self.url,
            {"session_token": "session-abc", "otp": "123456"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["detail"], "OTP expired")

    def test_verify_otp_used(self):
        self.otp.is_used = True
        self.otp.save(update_fields=["is_used"])

        resp = self.client.post(
            self.url,
            {"session_token": "session-abc", "otp": "123456"},
            format="json",
        )

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["detail"], "OTP already used")
