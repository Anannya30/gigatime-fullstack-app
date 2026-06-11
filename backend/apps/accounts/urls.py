from django.urls import path

from .views import (
    EmailPasswordLoginView,
    GoogleLoginView,
    MeView,
    OTPVerifyView,
    RefreshTokenView,
    RegisterView,
)

app_name = "accounts"

urlpatterns = [
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", EmailPasswordLoginView.as_view(), name="email-login"),
    path("verify-otp/", OTPVerifyView.as_view(), name="verify-otp"),
    path("refresh/", RefreshTokenView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
]
