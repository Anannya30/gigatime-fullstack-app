from django.urls import path

from .views import BatchJobCreateView, BatchJobStatusView

app_name = "inference"

urlpatterns = [
    path("batch/", BatchJobCreateView.as_view(), name="batch-create"),
    path("batch/<uuid:pk>/", BatchJobStatusView.as_view(), name="batch-status"),
]
