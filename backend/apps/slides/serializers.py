from rest_framework import serializers

from .models import Slide, SlideResult


class SlideSerializer(serializers.ModelSerializer):
    """Full representation of a slide for list/detail responses."""

    class Meta:
        model = Slide
        fields = "__all__"
        read_only_fields = [
            "id",
            "owner",
            "status",
            "submitted_at",
            "started_at",
            "completed_at",
            "file_path",
        ]


class SlideUploadSerializer(serializers.Serializer):
    """Validates a single-file upload plus its metadata."""

    file = serializers.FileField(write_only=True)
    filename = serializers.CharField(max_length=255, required=False, allow_blank=True)
    cancer_type = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    tissue_origin = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    cohort_id = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    tags = serializers.JSONField(required=False, default=list)


class SlideResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlideResult
        fields = "__all__"


class SlidePatchSerializer(serializers.ModelSerializer):
    """Write-only metadata patch — only these fields may be edited."""

    class Meta:
        model = Slide
        fields = ["cancer_type", "tissue_origin", "cohort_id", "notes", "tags"]
