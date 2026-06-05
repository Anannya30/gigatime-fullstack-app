import requests
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .models import User
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
