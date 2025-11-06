"""
Unit tests for user models.
"""

import pytest
from django.db import IntegrityError
from user.models import User
from user.tests.factories import UserFactory


@pytest.mark.django_db
class TestUserModel:
    """Tests for the User model."""

    def test_create_user_with_email_and_username(self):
        """Test creating a user with email and username."""
        user = User.objects.create_user(
            email="test@example.com", username="testuser", password="testpass123"
        )
        assert user.email == "test@example.com"
        assert user.username == "testuser"
        assert user.is_active is True
        assert user.is_staff is False
        assert user.check_password("testpass123")

    def test_create_superuser(self):
        """Test creating a superuser."""
        admin = User.objects.create_superuser(
            email="admin@example.com", username="admin", password="adminpass123"
        )
        assert admin.is_staff is True
        assert admin.is_superuser is True

    def test_email_must_be_unique(self):
        """Test that email must be unique."""
        User.objects.create_user(email="duplicate@example.com", username="user1", password="pass")
        with pytest.raises(IntegrityError):
            User.objects.create_user(
                email="duplicate@example.com", username="user2", password="pass"
            )

    def test_allow_duplicate_username(self):
        """Test that multiple users with the same username can exist."""
        user1 = User.objects.create_user(
            email="user1@example.com", username="username", password="pass"
        )
        user2 = User.objects.create_user(
            email="user2@example.com", username="username", password="pass"
        )
        assert user1.username == user2.username

    def test_email_is_normalized(self):
        """Test that email is normalized on creation."""
        user = User.objects.create_user(
            email="Test@EXAMPLE.COM", username="testuser", password="testpass123"
        )
        assert user.email == "Test@example.com"

    def test_user_str_representation(self):
        """Test the string representation of User."""
        user = UserFactory(email="display@example.com")
        assert str(user) == "display@example.com"

    def test_create_user_without_email_raises_error(self):
        """Test that creating a user without email raises ValueError."""
        with pytest.raises(ValueError, match="The Email field must be set"):
            User.objects.create_user(email="", username="testuser", password="testpass123")

    def test_create_superuser_with_is_staff_false_raises_error(self):
        """Test that creating superuser with is_staff=False raises error."""
        with pytest.raises(ValueError, match="Superuser must have is_staff=True"):
            User.objects.create_superuser(
                email="admin@example.com", username="admin", password="adminpass123", is_staff=False
            )

    def test_create_superuser_with_is_superuser_false_raises_error(self):
        """Test that creating superuser with is_superuser=False raises error."""
        with pytest.raises(ValueError, match="Superuser must have is_superuser=True"):
            User.objects.create_superuser(
                email="admin@example.com",
                username="admin",
                password="adminpass123",
                is_superuser=False,
            )

    def test_user_factory_creates_valid_user(self):
        """Test that UserFactory creates a valid user."""
        user = UserFactory()
        assert user.email
        assert user.username
        assert user.is_active is True
        assert user.check_password("testpassword123")

    def test_user_factory_batch_creates_multiple_users(self):
        """Test creating multiple users with factory."""
        users = UserFactory.create_batch(5)
        assert len(users) == 5
        assert User.objects.count() == 5
        # Verify all emails are unique
        emails = [user.email for user in users]
        assert len(emails) == len(set(emails))
