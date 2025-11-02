# Testing Guide

This document provides comprehensive information about the testing infrastructure for this Django project.

## Table of Contents

- [Testing Stack](#testing-stack)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Fixtures and Factories](#fixtures-and-factories)
- [Mocking External Services](#mocking-external-services)
- [Coverage Reports](#coverage-reports)

## Testing Stack

Our testing infrastructure includes:

### Core Framework
- **pytest** (8.3.4) - Modern Python testing framework
- **pytest-django** (4.9.0) - Django integration for pytest
- **pytest-cov** (6.0.0) - Coverage reporting
- **pytest-xdist** (3.6.1) - Parallel test execution

### Test Data & Mocking
- **factory-boy** (3.3.3) - Database fixture factories
- **Faker** (37.3.0) - Realistic fake data generation
- **model-bakery** (1.19.5) - Simple model creation
- **responses** (0.25.3) - HTTP request mocking
- **pytest-mock** (3.14.0) - Enhanced mocking capabilities
- **freezegun** (1.5.1) - Time/date mocking

### Quality & Utilities
- **coverage[toml]** (7.6.9) - Code coverage analysis
- **pytest-env** (1.1.5) - Environment variable management
- **pytest-randomly** (3.16.0) - Randomize test order

## Running Tests

### Run All Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run with coverage report
pytest --cov

# Run in parallel (faster)
pytest -n auto
```

### Run Specific Tests

```bash
# Run tests for a specific app
pytest user/tests/
pytest chat/tests/
pytest collection/tests/

# Run a specific test file
pytest user/tests/test_models.py

# Run a specific test class
pytest user/tests/test_models.py::TestUserModel

# Run a specific test function
pytest user/tests/test_models.py::TestUserModel::test_create_user_with_email_and_username
```

### Run Tests by Markers

```bash
# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Run only tests that interact with external APIs
pytest -m external

# Skip slow tests
pytest -m "not slow"
```

### Generate Coverage Reports

```bash
# Terminal coverage report
pytest --cov --cov-report=term-missing

# HTML coverage report (opens in browser)
pytest --cov --cov-report=html
open htmlcov/index.html

# XML coverage report (for CI/CD)
pytest --cov --cov-report=xml
```

## Writing Tests

### Test File Naming

- Test files must start with `test_` or end with `_tests.py`
- Test classes must start with `Test`
- Test functions must start with `test_`

### Using pytest-django

```python
import pytest
from django.urls import reverse
from rest_framework import status

# Mark tests that require database access
@pytest.mark.django_db
class TestUserModel:
    def test_create_user(self):
        from user.models import User
        user = User.objects.create_user(
            email='test@example.com',
            username='testuser',
            password='password123'
        )
        assert user.email == 'test@example.com'
```

### Using Fixtures

```python
import pytest

# Use fixtures defined in conftest.py
def test_user_profile(user, jwt_authenticated_client):
    """Test with pre-created user and authenticated client."""
    url = reverse('profile')
    response = jwt_authenticated_client.get(url)
    assert response.status_code == 200
    assert response.data['email'] == user.email
```

## Fixtures and Factories

### Available Global Fixtures

Defined in `conftest.py`:

- `api_client` - Unauthenticated DRF API client
- `authenticated_client` - DRF client with force_authenticate
- `jwt_authenticated_client` - Client with JWT token authentication
- `user` - Standard test user
- `admin_user` - Superuser/admin user
- `multiple_users` - List of 3 users
- `mock_vectordb` - Mocked VectorDB HTTP responses
- `mock_s3_storage` - Mocked AWS S3 storage

### Using Factory Boy

```python
from user.tests.factories import UserFactory
from chat.tests.factories import ChatSessionFactory, ChatMessageFactory

# Create a single user
user = UserFactory()

# Create user with custom values
user = UserFactory(email='custom@example.com', username='custom')

# Create multiple users
users = UserFactory.create_batch(5)

# Create without saving to database
user = UserFactory.build()

# Create a chat session with messages
session = ChatSessionFactory(user=user)
message = ChatMessageFactory(session=session, role='user')
```

### Using Model Bakery

```python
from model_bakery import baker

# Simple model creation
user = baker.make('user.User')
session = baker.make('chat.ChatSession', user=user)

# Create multiple instances
users = baker.make('user.User', _quantity=5)
```

## Mocking External Services

### Mocking VectorDB HTTP Requests

```python
import responses

@responses.activate
def test_vectordb_insert(jwt_authenticated_client):
    """Test with mocked VectorDB response."""
    # Mock the HTTP endpoint
    responses.add(
        responses.POST,
        'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/',
        json={'ok': True, 'result': {'insert_count': 5}},
        status=200
    )

    url = reverse('insert_to_collection')
    data = {'chat_data': [{'id': '1', 'vector': [0.1] * 768}]}
    response = jwt_authenticated_client.post(url, data, format='json')

    assert response.status_code == 201
```

### Using the mock_vectordb Fixture

```python
def test_signup_creates_collections(api_client, mock_vectordb):
    """Test that user signup creates VectorDB collections."""
    url = reverse('signup')
    data = {
        'email': 'newuser@example.com',
        'username': 'newuser',
        'password': 'password123',
        'password2': 'password123'
    }
    response = api_client.post(url, data, format='json')

    assert response.status_code == 201
    # VectorDB calls are automatically mocked
```

### Mocking Time with Freezegun

```python
from freezegun import freeze_time

@freeze_time("2024-01-01 12:00:00")
def test_timestamp_creation():
    """Test with frozen time."""
    from django.utils import timezone
    session = ChatSessionFactory()
    assert session.created_at.year == 2024
```

## Coverage Reports

### Configuration

Coverage is configured in `pyproject.toml`:

```toml
[tool.coverage.run]
source = ["."]
omit = [
    "*/migrations/*",
    "*/tests/*",
    "*/__pycache__/*",
    "*/venv/*",
]
branch = true

[tool.coverage.report]
precision = 2
show_missing = true
```

### Coverage Thresholds

Tests will fail if coverage drops below 80% (configured in `pytest.ini`):

```ini
[pytest]
addopts = --cov-fail-under=80
```

### Viewing Coverage Reports

```bash
# Generate HTML report
pytest --cov --cov-report=html

# Open in browser
open htmlcov/index.html
```
