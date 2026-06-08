from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action
from apps.slides.models import Slide

from .models import BatchJob
from .serializers import BatchJobCreateSerializer, BatchJobStatusSerializer
from .tasks import run_batch_inference


class BatchJobCreateView(APIView):
    """POST /api/inference/batch/ — queue a batch inference run."""

    def post(self, request):
        serializer = BatchJobCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slide_ids = serializer.validated_data["slides"]

        # Only slides owned by the requesting user may be batched.
        slides = list(Slide.objects.filter(id__in=slide_ids, owner=request.user))
        found_ids = {slide.id for slide in slides}
        missing = [str(sid) for sid in slide_ids if sid not in found_ids]
        if missing:
            return Response(
                {"detail": f"Slides not found or not owned: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch_job = BatchJob.objects.create(owner=request.user)
        batch_job.slides.set(slides)

        run_batch_inference.delay(str(batch_job.id))

        log_action(
            user=request.user,
            action="inference.batch_create",
            resource_type="BatchJob",
            resource_id=batch_job.id,
            request=request,
            payload_snapshot={"slides": [str(s.id) for s in slides]},
            response_status=status.HTTP_201_CREATED,
        )
        return Response(
            {"id": str(batch_job.id), "status": batch_job.status},
            status=status.HTTP_201_CREATED,
        )


class BatchJobStatusView(APIView):
    """GET /api/inference/batch/<uuid:pk>/ — batch + per-slide status."""

    def get(self, request, pk):
        batch_job = get_object_or_404(BatchJob, pk=pk, owner=request.user)
        return Response(
            BatchJobStatusSerializer(batch_job).data,
            status=status.HTTP_200_OK,
        )
