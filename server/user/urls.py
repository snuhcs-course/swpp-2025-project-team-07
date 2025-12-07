from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # User Auth
    path("auth/signup/", views.signup, name="signup"),
    path("auth/login/", views.login, name="login"),
    path("auth/logout/", views.logout, name="logout"),
    path("auth/refresh/", views.CustomTokenRefreshView.as_view(), name="token_refresh"),
    path("auth/password-reset/", views.password_reset_request, name="password_reset_request"),
    path(
        "auth/password-reset-confirm/", views.password_reset_confirm, name="password_reset_confirm"
    ),
    # User Profile
    path("user/profile/", views.profile, name="profile"),
]
