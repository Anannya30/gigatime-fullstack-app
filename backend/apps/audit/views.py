from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogPagination(PageNumberPagination):
    page_size = 50


class AuditLogListView(ListAPIView):
    """GET /api/audit/ — audit logs, newest first, with optional filters.

    Supported query params: ``action``, ``resource_type``, ``user_id``.
    """

    serializer_class = AuditLogSerializer
    pagination_class = AuditLogPagination

    def get_queryset(self):
        qs = AuditLog.objects.all()  # Meta.ordering already sorts newest first.

        action = self.request.query_params.get("action")
        if action:
            qs = qs.filter(action=action)

        resource_type = self.request.query_params.get("resource_type")
        if resource_type:
            qs = qs.filter(resource_type=resource_type)

        user_id = self.request.query_params.get("user_id")
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs
