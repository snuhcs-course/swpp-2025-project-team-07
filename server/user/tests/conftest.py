"""
User app specific test fixtures.
"""
import pytest
from user.tests.factories import UserFactory, StaffUserFactory, SuperUserFactory


@pytest.fixture
def user_factory():
    """Provides the UserFactory for creating users in tests."""
    return UserFactory


@pytest.fixture
def staff_user(db):
    """Creates a staff user for testing."""
    return StaffUserFactory()


@pytest.fixture
def super_user(db):
    """Creates a superuser for testing."""
    return SuperUserFactory()
