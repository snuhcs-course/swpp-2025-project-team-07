from storages.backends.s3boto3 import S3Boto3Storage


class StaticS3Boto3Storage(S3Boto3Storage):
    """
    Custom S3 storage class for static files
    """
    location = 'static'
    default_acl = None
    file_overwrite = False
    querystring_auth = False


class MediaS3Boto3Storage(S3Boto3Storage):
    """
    Custom S3 storage class for media files
    """
    location = 'media'
    default_acl = None
    file_overwrite = False
    querystring_auth = False