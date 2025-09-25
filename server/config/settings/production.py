from .base import *

# Production settings

DEBUG = False

ALLOWED_HOSTS = [
    'ec2-43-202-157-112.ap-northeast-2.compute.amazonaws.com',
]

# django-storages configuration for S3
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "access_key": os.getenv('AWS_ACCESS_KEY_ID'),
            "secret_key": os.getenv('AWS_SECRET_ACCESS_KEY'),
            "bucket_name": os.getenv('AWS_S3_BUCKET_NAME'),
            "region_name": os.getenv('AWS_S3_REGION', 'ap-northeast-2'),
            "location": "media",
            "default_acl": None,
            "file_overwrite": False,
            "querystring_auth": False,
        },
    },
    "staticfiles": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "access_key": os.getenv('AWS_ACCESS_KEY_ID'),
            "secret_key": os.getenv('AWS_SECRET_ACCESS_KEY'),
            "bucket_name": os.getenv('AWS_S3_BUCKET_NAME'),
            "region_name": os.getenv('AWS_S3_REGION', 'ap-northeast-2'),
            "location": "static",
            "default_acl": None,
            "file_overwrite": False,
            "querystring_auth": False,
        },
    },
}

# Static and Media URLs
_AWS_S3_BUCKET_NAME = os.getenv('AWS_S3_BUCKET_NAME')
_AWS_S3_REGION = os.getenv('AWS_S3_REGION', 'ap-northeast-2')
_AWS_S3_CUSTOM_DOMAIN = f'{_AWS_S3_BUCKET_NAME}.s3.{_AWS_S3_REGION}.amazonaws.com'

STATIC_URL = f'https://{_AWS_S3_CUSTOM_DOMAIN}/static/'
MEDIA_URL = f'https://{_AWS_S3_CUSTOM_DOMAIN}/media/'

# Security settings for production
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 3600
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# CORS settings for production
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    # Add your frontend URLs here when you deploy frontend
    # "https://yourdomain.com",
]

# Email settings (configure based on your email service)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@yourdomain.com')

# Logging for production
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': '/var/log/django.log',
            'formatter': 'verbose',
        },
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
}
