from .base import *

# Local development settings

DEBUG = True

ALLOWED_HOSTS = ['*']

# Disable CORS restrictions for local development
CORS_ALLOW_ALL_ORIGINS = True

# Email backend for local development (console)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Logging for development
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}