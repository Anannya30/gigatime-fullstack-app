import os
import uuid

from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action

from .models import Slide, SlideResult, SlideStatus
from .serializers import (
    SlidePatchSerializer,
    SlideResultSerializer,
    SlideSerializer,
    SlideUploadSerializer,
)


def _save_upload(uploaded):
    """Persist an uploaded file under MEDIA_ROOT and return (abs_path, size)."""
    os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
    ext = os.path.splitext(uploaded.name)[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    abs_path = os.path.join(str(settings.MEDIA_ROOT), stored_name)
    with open(abs_path, "wb") as fh:
        for chunk in uploaded.chunks():
            fh.write(chunk)
    return abs_path, uploaded.size


class OwnerSlideMixin:
    """Fetch a non-deleted slide that belongs to the requesting user."""

    def get_slide(self, request, pk):
        return get_object_or_404(Slide, pk=pk, owner=request.user)


class SlideListView(ListAPIView):
    """GET /api/slides/ — slides owned by the current user (excludes deleted)."""

    serializer_class = SlideSerializer

    def get_queryset(self):
        return Slide.objects.filter(owner=self.request.user)


class SlideDetailView(OwnerSlideMixin, RetrieveAPIView):
    """GET /api/slides/<pk>/ — a single owned slide."""

    serializer_class = SlideSerializer

    def get_queryset(self):
        return Slide.objects.filter(owner=self.request.user)


class SlideUploadView(APIView):
    """POST /api/slides/upload/ — single PNG upload + metadata."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = SlideUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        uploaded = data["file"]

        abs_path, size = _save_upload(uploaded)
        slide = Slide.objects.create(
            owner=request.user,
            filename=data.get("filename") or uploaded.name,
            original_filename=uploaded.name,
            file_path=abs_path,
            file_size=size,
            cancer_type=data.get("cancer_type", ""),
            tissue_origin=data.get("tissue_origin", ""),
            cohort_id=data.get("cohort_id", ""),
            notes=data.get("notes", ""),
            tags=data.get("tags") or [],
            status=SlideStatus.CREATED,
        )
        log_action(
            user=request.user,
            action="slide.upload",
            resource_type="Slide",
            resource_id=slide.id,
            request=request,
            payload_snapshot={"filename": slide.filename},
            response_status=status.HTTP_201_CREATED,
        )
        return Response(SlideSerializer(slide).data, status=status.HTTP_201_CREATED)


class SlideBatchUploadView(APIView):
    """POST /api/slides/batch/ — multiple files sharing one set of metadata."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist("files")
        if not files:
            return Response(
                {"detail": "No files provided under the 'files' field."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shared = SlidePatchSerializer(data=request.data, partial=True)
        shared.is_valid(raise_exception=True)
        meta = shared.validated_data

        slides = []
        for uploaded in files:
            abs_path, size = _save_upload(uploaded)
            slides.append(
                Slide.objects.create(
                    owner=request.user,
                    filename=uploaded.name,
                    original_filename=uploaded.name,
                    file_path=abs_path,
                    file_size=size,
                    cancer_type=meta.get("cancer_type", ""),
                    tissue_origin=meta.get("tissue_origin", ""),
                    cohort_id=meta.get("cohort_id", ""),
                    notes=meta.get("notes", ""),
                    tags=meta.get("tags") or [],
                    status=SlideStatus.CREATED,
                )
            )
        log_action(
            user=request.user,
            action="slide.batch_upload",
            resource_type="Slide",
            resource_id=",".join(str(s.id) for s in slides),
            request=request,
            payload_snapshot={"count": len(slides)},
            response_status=status.HTTP_201_CREATED,
        )
        return Response(
            SlideSerializer(slides, many=True).data, status=status.HTTP_201_CREATED
        )


class SlidePatchView(OwnerSlideMixin, APIView):
    """PATCH /api/slides/<pk>/ — edit metadata only."""

    def patch(self, request, pk):
        slide = self.get_slide(request, pk)
        serializer = SlidePatchSerializer(slide, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_action(
            user=request.user,
            action="slide.update",
            resource_type="Slide",
            resource_id=slide.id,
            request=request,
            payload_snapshot=dict(serializer.validated_data),
            response_status=status.HTTP_200_OK,
        )
        return Response(SlideSerializer(slide).data, status=status.HTTP_200_OK)


class SlideDeleteView(OwnerSlideMixin, APIView):
    """DELETE /api/slides/<pk>/ — soft delete; never removes file or row."""

    def delete(self, request, pk):
        slide = self.get_slide(request, pk)
        slide.is_deleted = True
        slide.deleted_at = timezone.now()
        slide.deleted_by = request.user
        slide.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])
        log_action(
            user=request.user,
            action="slide.delete",
            resource_type="Slide",
            resource_id=slide.id,
            request=request,
            payload_snapshot={},
            response_status=status.HTTP_204_NO_CONTENT,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlideResultView(OwnerSlideMixin, APIView):
    """GET /api/slides/<pk>/results/ — marker table once inference is done."""

    def get(self, request, pk):
        slide = self.get_slide(request, pk)
        try:
            result = slide.result
        except SlideResult.DoesNotExist:
            return Response(
                {"detail": "Results are not ready for this slide."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(SlideResultSerializer(result).data, status=status.HTTP_200_OK)


class SlideTiffDownloadView(OwnerSlideMixin, APIView):
    """GET /api/slides/<pk>/download-tiff/ — stream the OME-TIFF output."""

    def get(self, request, pk):
        slide = self.get_slide(request, pk)
        # The OME-TIFF sits next to the source PNG: <original_stem>_pred.ome.tiff.
        base, _ext = os.path.splitext(slide.file_path)
        tiff_path = f"{base}_pred.ome.tiff"
        if not os.path.exists(tiff_path):
            return Response(
                {"detail": "OME-TIFF not ready yet"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return FileResponse(
            open(tiff_path, "rb"),
            content_type="image/tiff",
            as_attachment=True,
            filename=os.path.basename(tiff_path),
        )


class SlideItemView(SlideDetailView, SlidePatchView, SlideDeleteView):
    """Routes the shared /api/slides/<pk>/ URL to GET / PATCH / DELETE handlers."""

    pass
