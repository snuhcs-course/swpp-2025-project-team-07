"""
Django settings for testing environment.
Uses SQLite in-memory database for fast test execution.
"""
from .base import *

# Use SQLite for tests (much faster than MySQL)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Disable migrations for faster tests
# pytest-django will handle this with --nomigrations flag

# Mock VectorDB URLs for tests
VECTORDB_CHAT_HOST = 'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000'
VECTORDB_SCREEN_HOST = 'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001'

# Disable debug toolbar for tests
INSTALLED_APPS = [app for app in INSTALLED_APPS if app != 'debug_toolbar']
MIDDLEWARE = [mw for mw in MIDDLEWARE if 'debug_toolbar' not in mw]

# Use simple password hasher for faster tests
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Disable logging during tests
LOGGING = {
    'version': 1,
    'disable_existing_loggers': True,
}

# Use console email backend
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Disable HTTPS redirects
SECURE_SSL_REDIRECT = False
