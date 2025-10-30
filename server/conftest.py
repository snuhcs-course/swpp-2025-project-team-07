"""
Root conftest.py for shared test fixtures and configuration.
"""
import pytest
from django.conf import settings
from rest_framework.test import APIClient


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """
    Configure test database to use SQLite for faster tests.
    Override this in specific test files if you need MySQL-specific testing.
    """
    with django_db_blocker.unblock():
        # Database is automatically created by pytest-django
        pass


@pytest.fixture
def api_client():
    """
    Provides an unauthenticated DRF API client.
    """
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, user):
    """
    Provides an authenticated DRF API client with a logged-in user.
    """
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def jwt_authenticated_client(api_client, user):
    """
    Provides an API client authenticated with JWT tokens.
    """
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
    return api_client


@pytest.fixture
def user(db):
    """
    Creates a standard test user.
    Import this fixture in tests that need a basic user.
    """
    from user.models import User
    return User.objects.create_user(
        email="testuser@example.com",
        username="testuser",
        password="testpassword123"
    )


@pytest.fixture
def admin_user(db):
    """
    Creates an admin/staff user for testing admin functionality.
    """
    from user.models import User
    return User.objects.create_user(
        email="admin@example.com",
        username="admin",
        password="adminpassword123",
        is_staff=True,
        is_superuser=True
    )


@pytest.fixture
def multiple_users(db):
    """
    Creates multiple users for testing list views and relationships.
    """
    from user.models import User
    return [
        User.objects.create_user(
            email=f"user{i}@example.com",
            username=f"user{i}",
            password=f"password{i}"
        )
        for i in range(1, 4)
    ]


# Mock external services
@pytest.fixture
def mock_vectordb():
    """
    Mocks VectorDB API responses using the responses library.
    Use this fixture to avoid hitting real VectorDB endpoints during tests.
    """
    import responses as responses_lib

    with responses_lib.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        # Mock chat VectorDB - all possible endpoints
        rsps.add(
            responses_lib.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200
        )
        rsps.add(
            responses_lib.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 0}},
            status=200
        )
        rsps.add(
            responses_lib.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/search/",
            json={"ok": True, "scores": [], "ids": []},
            status=200
        )

        # Mock screen VectorDB - all possible endpoints
        rsps.add(
            responses_lib.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200
        )
        rsps.add(
            responses_lib.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 0}},
            status=200
        )
        rsps.add(
            responses_lib.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/search/",
            json={"ok": True, "scores": [], "ids": []},
            status=200
        )

        yield rsps


@pytest.fixture(autouse=True)
def mock_s3_storage(monkeypatch):
    """
    Automatically mocks S3 storage for all tests to avoid AWS calls.
    Uses Django's default file storage instead.
    """
    from django.core.files.storage import default_storage
    monkeypatch.setattr('storages.backends.s3boto3.S3Boto3Storage', lambda: default_storage)
