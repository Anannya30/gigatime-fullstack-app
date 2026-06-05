from django.urls import path

from .views import (
    SlideBatchUploadView,
    SlideItemView,
    SlideListView,
    SlideResultView,
    SlideUploadView,
)

app_name = "slides"

urlpatterns = [
    path("", SlideListView.as_view(), name="slide-list"),
    path("upload/", SlideUploadView.as_view(), name="slide-upload"),
    path("batch/", SlideBatchUploadView.as_view(), name="slide-batch"),
    # GET (detail), PATCH (metadata), DELETE (soft delete) share this URL.
    path("<uuid:pk>/", SlideItemView.as_view(), name="slide-detail"),
    path("<uuid:pk>/results/", SlideResultView.as_view(), name="slide-results"),
]
