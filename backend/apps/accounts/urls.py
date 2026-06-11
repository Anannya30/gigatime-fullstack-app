from django.urls import path

from .views import (
    EmailPasswordLoginView,
    ForgotPasswordRequestView,
    ForgotPasswordVerifyOTPView,
    GoogleLoginView,
    MeView,
    OTPVerifyView,
    RefreshTokenView,
    RegisterView,
    ResetPasswordView,
)

app_name = "accounts"

urlpatterns = [
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", EmailPasswordLoginView.as_view(), name="email-login"),
    path("verify-otp/", OTPVerifyView.as_view(), name="verify-otp"),
    path("forgot-password/", ForgotPasswordRequestView.as_view(), name="forgot-password"),
    path(
        "forgot-password/verify/",
        ForgotPasswordVerifyOTPView.as_view(),
        name="forgot-password-verify",
    ),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    path("refresh/", RefreshTokenView.as_view(), name="token-refresh"),
    path("me/", MeView.as_view(), name="me"),
]
