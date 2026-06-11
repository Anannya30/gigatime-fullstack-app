import random
import secrets
from datetime import timedelta

import requests
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from apps.audit.utils import log_action

from .models import OTPToken, User
from .serializers import GoogleAuthSerializer, UserSerializer

# Google's lightweight ID-token verification endpoint.
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def _tokens_for_user(user):
    """Issue a SimpleJWT access/refresh pair for ``user``."""
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class GoogleLoginView(APIView):
    """POST /api/auth/google/ — exchange a Google ID token for GigaTIME JWTs."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        credential = serializer.validated_data["credential"]

        # Verify the credential with Google.
        try:
            resp = requests.get(
                GOOGLE_TOKENINFO_URL,
                params={"id_token": credential},
                timeout=10,
            )
        except requests.RequestException:
            return Response(
                {"detail": "Could not reach Google to verify the credential."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if resp.status_code != 200:
            return Response(
                {"detail": "Invalid Google credential."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = resp.json()
        email = data.get("email")
        if not email:
            return Response(
                {"detail": "Google credential did not contain an email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create or fetch the user, then refresh their Google metadata.
        user, _created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": data.get("given_name", ""),
                "last_name": data.get("family_name", ""),
            },
        )
        user.google_id = data.get("sub") or user.google_id
        user.avatar_url = data.get("picture", "") or user.avatar_url
        user.is_email_verified = True
        user.save()

        tokens = _tokens_for_user(user)
        log_action(
            user=user,
            action="auth.google_login",
            resource_type="User",
            resource_id=user.id,
            request=request,
            payload_snapshot={"email": email},
            response_status=status.HTTP_200_OK,
        )
        return Response(
            {
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class RegisterView(APIView):
    """POST /api/auth/register/ — create an account (no auto-login)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password") or ""
        first_name = request.data.get("first_name", "")
        last_name = request.data.get("last_name", "")
        lab_name = request.data.get("lab_name", "")

        if email and User.objects.filter(email=email).exists():
            return Response(
                {"detail": "Email already registered"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 8:
            return Response(
                {"detail": "Password must be at least 8 characters"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            lab_name=lab_name,
            is_email_verified=False,
        )
        user.set_password(password)
        user.save()

        send_mail(
            subject="Welcome to GigaTIME",
            message=(
                f"Hi {first_name}, your GigaTIME account has been created. "
                "You can now sign in at http://localhost"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        log_action(
            user=user,
            action="auth.register",
            resource_type="User",
            resource_id=user.id,
            request=request,
            payload_snapshot={"email": user.email},
            response_status=status.HTTP_201_CREATED,
        )
        return Response(
            {"message": "Account created. You can now sign in."},
            status=status.HTTP_201_CREATED,
        )


class EmailPasswordLoginView(APIView):
    """POST /api/auth/login/ — verify email+password, then email a 6-digit OTP."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            user = None

        if user is None or not password or not user.check_password(password):
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        otp = str(random.randint(100000, 999999))
        session_token = secrets.token_urlsafe(32)
        expiry_minutes = getattr(settings, "OTP_EXPIRY_MINUTES", 10)
        OTPToken.objects.create(
            user=user,
            token=otp,
            session_token=session_token,
            expires_at=timezone.now() + timedelta(minutes=expiry_minutes),
        )

        send_mail(
            subject="GigaTIME — Your verification code",
            message=(
                f"Your verification code is: {otp}\n\n"
                "This code expires in 10 minutes.\n\n"
                "If you did not request this, please ignore this email."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        return Response(
            {"otp_required": True, "session_token": session_token},
            status=status.HTTP_200_OK,
        )


class OTPVerifyView(APIView):
    """POST /api/auth/verify-otp/ — exchange a valid OTP for GigaTIME JWTs."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        session_token = request.data.get("session_token")
        otp = request.data.get("otp")

        try:
            otp_token = OTPToken.objects.get(session_token=session_token)
        except OTPToken.DoesNotExist:
            return Response(
                {"detail": "Invalid session"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_token.is_used:
            return Response(
                {"detail": "OTP already used"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_token.expires_at <= timezone.now():
            return Response(
                {"detail": "OTP expired"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp_token.token != otp:
            return Response(
                {"detail": "Invalid OTP"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp_token.is_used = True
        otp_token.save(update_fields=["is_used"])

        user = otp_token.user
        tokens = _tokens_for_user(user)
        log_action(
            user=user,
            action="auth.otp_login",
            resource_type="User",
            resource_id=user.id,
            request=request,
            payload_snapshot={"email": user.email},
            response_status=status.HTTP_200_OK,
        )
        return Response(
            {
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class RefreshTokenView(TokenRefreshView):
    """POST /api/auth/refresh/ — exchange a refresh token for a new access token."""

    permission_classes = [AllowAny]


class MeView(APIView):
    """GET /api/auth/me/ — return the currently authenticated user."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
