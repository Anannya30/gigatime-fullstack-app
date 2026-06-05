from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    """Read-only representation of a user returned by the auth endpoints."""

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "lab_name",
            "avatar_url",
            "is_email_verified",
        ]
        read_only_fields = fields


class GoogleAuthSerializer(serializers.Serializer):
    """Validates the Google ID token (``credential``) sent from the frontend."""

    credential = serializers.CharField(write_only=True, trim_whitespace=True)

    def validate_credential(self, value):
        if not value:
            raise serializers.ValidationError("A Google credential token is required.")
        return value
