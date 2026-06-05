from django.urls import path

from .views import GoogleLoginView, MeView, RefreshTokenView

app_name = "accounts"

urlpatterns = [
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("refresh/", RefreshTokenView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
]
