from django.db import models
from django.conf import settings


class ScreenRecording(models.Model):
    """
    Stores encrypted video content and metadata for screen recordings.

    Each record represents a single video chunk with its encrypted blob data.
    Videos can optionally be grouped into recording sessions via video_set_id.
    """

    video_id = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        primary_key=True,
        help_text="Unique video ID matching VectorDB entry (e.g., 'screen_1234567890')",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="screen_recordings",
        db_index=True,
        help_text="Owner of this screen recording",
    )
    encrypted_content = models.TextField(
        help_text="Encrypted JSON payload containing video_base64 and metadata"
    )
    video_set_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional: Groups multiple video chunks into one recording session (e.g., UUID)",
    )
    timestamp = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Unix timestamp in milliseconds, used for sorting within video sets",
    )
    collection_version = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        db_index=True,
        help_text="Optional collection version for testing different client versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "collection_screenrecording"
        ordering = ["video_set_id", "timestamp"]
        indexes = [
            models.Index(fields=["user", "collection_version"]),
            models.Index(fields=["user", "video_set_id"]),
            models.Index(fields=["video_set_id", "timestamp"]),
        ]
        verbose_name = "Screen Recording"
        verbose_name_plural = "Screen Recordings"

    def __str__(self):
        if self.video_set_id:
            return f"ScreenRecording {self.video_id} (Set {self.video_set_id})"
        return f"ScreenRecording {self.video_id}"
