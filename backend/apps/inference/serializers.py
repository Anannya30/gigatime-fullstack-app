from rest_framework import serializers

from apps.slides.models import Slide

from .models import BatchJob


class BatchJobCreateSerializer(serializers.Serializer):
    """Validates the list of slide UUIDs submitted for a batch run."""

    slides = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
    )


class BatchSlideStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Slide
        fields = ["id", "filename", "status"]


class BatchJobStatusSerializer(serializers.ModelSerializer):
    slides = BatchSlideStatusSerializer(many=True, read_only=True)

    class Meta:
        model = BatchJob
        fields = [
            "id",
            "status",
            "created_at",
            "completed_at",
            "error_message",
            "slides",
        ]
