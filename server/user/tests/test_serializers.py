"""
Unit tests for user serializers.
"""

import pytest
from rest_framework import serializers as drf_serializers

from user.models import User
from user.serializers import UserSignupSerializer, UserLoginSerializer
from user.tests.factories import UserFactory


@pytest.mark.django_db
class TestUserSignupSerializer:
    """Tests for UserSignupSerializer validation."""

    def test_signup_with_valid_data(self):
        """Test serializer validates correct signup data."""
        data = {
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "password123",
            "password_confirm": "password123",
        }
        serializer = UserSignupSerializer(data=data)
        assert serializer.is_valid(), f"Serializer errors: {serializer.errors}"
        user = serializer.save()
        assert user.email == "newuser@example.com"
        assert user.username == "newuser"

    def test_validate_duplicate_email(self):
        """Test that duplicate email raises validation error."""
        existing_user = UserFactory(email="existing@example.com")

        data = {
            "email": "existing@example.com",  # Duplicate email
            "username": "newuser",
            "password": "password123",
            "password_confirm": "password123",
        }
        serializer = UserSignupSerializer(data=data)

        assert not serializer.is_valid()
        assert "email" in serializer.errors
        assert "already exists" in str(serializer.errors["email"][0]).lower()

    def test_validate_username_too_short(self):
        """Test that username shorter than 3 characters raises validation error."""
        data = {
            "email": "newuser@example.com",
            "username": "ab",  # Only 2 characters
            "password": "password123",
            "password_confirm": "password123",
        }
        serializer = UserSignupSerializer(data=data)

        assert not serializer.is_valid()
        assert "username" in serializer.errors
        assert "3 characters" in str(serializer.errors["username"][0]).lower()

    def test_validate_duplicate_username(self):
        """Test that duplicate username raises validation error."""
        existing_user = UserFactory(username="existinguser")

        data = {
            "email": "newuser@example.com",
            "username": "existinguser",  # Duplicate username
            "password": "password123",
            "password_confirm": "password123",
        }
        serializer = UserSignupSerializer(data=data)

        assert not serializer.is_valid()
        assert "username" in serializer.errors
        assert "already exists" in str(serializer.errors["username"][0]).lower()

    def test_validate_password_mismatch(self):
        """Test that mismatched passwords raise validation error."""
        data = {
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "password123",
            "password_confirm": "differentpassword",
        }
        serializer = UserSignupSerializer(data=data)

        assert not serializer.is_valid()
        assert "non_field_errors" in serializer.errors
        assert "do not match" in str(serializer.errors["non_field_errors"][0]).lower()


@pytest.mark.django_db
class TestUserLoginSerializer:
    """Tests for UserLoginSerializer validation."""

    def test_login_with_valid_credentials(self):
        """Test serializer validates correct login credentials."""
        user = UserFactory()
        # UserFactory sets password to 'testpassword123'

        data = {"email": user.email, "password": "testpassword123"}

        # Need to provide request context for authentication
        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post("/api/auth/login/")

        serializer = UserLoginSerializer(data=data, context={"request": request})
        assert serializer.is_valid(), f"Serializer errors: {serializer.errors}"
        assert serializer.validated_data["user"] == user

    def test_login_with_invalid_credentials(self):
        """Test that invalid credentials raise validation error."""
        user = UserFactory()

        data = {"email": user.email, "password": "wrongpassword"}

        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post("/api/auth/login/")

        serializer = UserLoginSerializer(data=data, context={"request": request})

        assert not serializer.is_valid()
        assert "non_field_errors" in serializer.errors
        assert "invalid" in str(serializer.errors["non_field_errors"][0]).lower()

    def test_login_with_inactive_user(self):
        """Test that logging into disabled user account raises validation error."""
        inactive_user = UserFactory(is_active=False)

        data = {"email": inactive_user.email, "password": "testpassword123"}

        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post("/api/auth/login/")

        serializer = UserLoginSerializer(data=data, context={"request": request})

        assert not serializer.is_valid()
        assert "non_field_errors" in serializer.errors
        # Either "disabled" or "invalid" error message is acceptable
        error_msg = str(serializer.errors["non_field_errors"][0]).lower()
        assert "disabled" in error_msg or "invalid" in error_msg

    def test_login_without_email(self):
        """Test that login without email raises validation error."""
        data = {"password": "password123"}

        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post("/api/auth/login/")

        serializer = UserLoginSerializer(data=data, context={"request": request})

        assert not serializer.is_valid()
        assert "email" in serializer.errors

    def test_login_without_password(self):
        """Test that login without password raises validation error."""
        data = {"email": "test@example.com"}

        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post("/api/auth/login/")

        serializer = UserLoginSerializer(data=data, context={"request": request})

        assert not serializer.is_valid()
        assert "password" in serializer.errors

    def test_login_without_email_and_password(self):
        """Test that login without email and password raises validation error."""
        data = {}

        from django.test import RequestFactory

        factory = RequestFactory()
        request = factory.post("/api/auth/login/")

        serializer = UserLoginSerializer(data=data, context={"request": request})

        assert not serializer.is_valid()
        assert "email" in serializer.errors or "password" in serializer.errors
