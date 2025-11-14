from django.db import models
from django.conf import settings


class VideoSetMetadata(models.Model):
    """
    Metadata for screen recording video chunks.
    Links video entries in vectordb to their parent recording set.
    """

    video_id = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Unique video ID matching vectordb entry (e.g., 'screen_1234567890')",
    )
    video_set_id = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Groups multiple video chunks into one recording session (e.g., UUID)",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="video_metadata",
        help_text="Owner of this video recording",
    )
    timestamp = models.BigIntegerField(
        db_index=True, help_text="Unix timestamp in milliseconds, used for sorting within set"
    )
    collection_version = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Optional collection version for A/B testing",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["video_set_id", "timestamp"]
        indexes = [
            models.Index(fields=["user", "video_set_id"]),
            models.Index(fields=["video_set_id", "timestamp"]),
        ]
        verbose_name = "Video Set Metadata"
        verbose_name_plural = "Video Set Metadata"

    def __str__(self):
        return f"Video {self.video_id} (Set {self.video_set_id})"
