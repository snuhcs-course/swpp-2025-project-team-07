"""
Integration tests for user views/API endpoints.
"""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from user.models import User
from user.tests.factories import UserFactory


@pytest.mark.django_db
class TestSignupView:
    """Tests for the signup endpoint."""

    def test_signup_with_valid_data(self, api_client, mock_vectordb):
        """Test successful user signup with valid data."""
        url = reverse("signup")
        data = {
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "securepassword123",
            "password_confirm": "securepassword123",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["message"] == "User created successfully"
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["email"] == "newuser@example.com"

        # Verify user was created in database
        assert User.objects.filter(email="newuser@example.com").exists()

    def test_signup_with_mismatched_passwords(self, api_client):
        """Test signup fails when passwords don't match."""
        url = reverse("signup")
        data = {
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "password123",
            "password_confirm": "differentpassword",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not User.objects.filter(email="newuser@example.com").exists()

    def test_signup_with_duplicate_email(self, api_client, user):
        """Test signup fails with duplicate email."""
        url = reverse("signup")
        data = {
            "email": user.email,
            "username": "differentusername",
            "password": "password123",
            "password_confirm": "password123",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "email" in response.data

    def test_signup_with_short_username(self, api_client):
        """Test signup fails when username is shorter than 3 characters."""
        url = reverse("signup")
        data = {
            "email": "newuser@example.com",
            "username": "ab",  # Only 2 characters
            "password": "password123",
            "password_confirm": "password123",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "username" in response.data
        assert "at least 3 characters" in str(response.data["username"][0]).lower()

    def test_signup_with_duplicate_username(self, api_client, user):
        """Test signup succeeds with duplicate username."""
        url = reverse("signup")
        data = {
            "email": "newuser@example.com",
            "username": user.username,  # Duplicate username
            "password": "password123",
            "password_confirm": "password123",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["user"]["username"] == user.username

        # Verify user was created in database
        assert User.objects.filter(email="newuser@example.com").exists()

    def test_signup_with_invalid_email(self, api_client):
        """Test signup fails with invalid email format."""
        url = reverse("signup")
        data = {
            "email": "not-an-email",
            "username": "newuser",
            "password": "password123",
            "password_confirm": "password123",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestLoginView:
    """Tests for the login endpoint."""

    def test_login_with_valid_credentials(self, api_client, user):
        """Test successful login with valid credentials."""
        url = reverse("login")
        data = {"email": user.email, "password": "testpassword123"}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["message"] == "Login successful"
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["email"] == user.email

    def test_login_with_invalid_password(self, api_client, user):
        """Test login fails with invalid password."""
        url = reverse("login")
        data = {"email": user.email, "password": "wrongpassword"}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_with_nonexistent_email(self, api_client):
        """Test login fails with non-existent email."""
        url = reverse("login")
        data = {"email": "nonexistent@example.com", "password": "password123"}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_with_inactive_user(self, api_client):
        """Test login fails for inactive user."""
        inactive_user = UserFactory(is_active=False)
        url = reverse("login")
        data = {"email": inactive_user.email, "password": "testpassword123"}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # Inactive users are rejected (authentication returns None for security)

    def test_login_without_email(self, api_client):
        """Test login fails when email is not provided."""
        url = reverse("login")
        data = {"password": "password123"}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_login_without_password(self, api_client):
        """Test login fails when password is not provided."""
        url = reverse("login")
        data = {"email": "test@example.com"}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestLogoutView:
    """Tests for the logout endpoint."""

    def test_logout_with_valid_token(self, jwt_authenticated_client, user):
        """Test successful logout with valid refresh token."""
        refresh = RefreshToken.for_user(user)
        url = reverse("logout")
        data = {"refresh": str(refresh)}

        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["message"] == "Logout successful"

    def test_logout_without_token(self, jwt_authenticated_client):
        """Test logout fails without refresh token."""
        url = reverse("logout")
        response = jwt_authenticated_client.post(url, {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    def test_logout_with_invalid_token(self, jwt_authenticated_client):
        """Test logout fails with invalid token."""
        url = reverse("logout")
        data = {"refresh": "invalid_token_string"}

        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestProfileView:
    """Tests for the profile endpoint."""

    def test_get_profile_authenticated(self, jwt_authenticated_client, user):
        """Test authenticated user can retrieve their profile."""
        url = reverse("user_profile")
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["email"] == user.email
        assert response.data["username"] == user.username
        assert "id" in response.data
        assert "date_joined" in response.data

    def test_get_profile_unauthenticated(self, api_client):
        """Test unauthenticated user cannot access profile."""
        url = reverse("user_profile")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestTokenRefreshView:
    """Tests for JWT token refresh endpoint."""

    def test_refresh_token_with_valid_token(self, api_client, user):
        """Test refreshing access token with valid refresh token."""
        refresh = RefreshToken.for_user(user)
        url = reverse("token_refresh")
        data = {"refresh": str(refresh)}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data

    def test_refresh_token_with_invalid_token(self, api_client):
        """Test refresh fails with invalid token."""
        url = reverse("token_refresh")
        data = {"refresh": "invalid_token"}

        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
