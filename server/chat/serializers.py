from rest_framework import serializers
from .models import ChatSession, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    """Serializer for ChatMessage model."""

    class Meta:
        model = ChatMessage
        fields = ["id", "session", "role", "content", "timestamp", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_role(self, value):
        """Ensure role is one of the allowed choices."""
        if value not in dict(ChatMessage.ROLE_CHOICES):
            raise serializers.ValidationError(
                f"Invalid role. Must be one of: {', '.join(dict(ChatMessage.ROLE_CHOICES).keys())}"
            )
        return value


class ChatMessageCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating messages (excludes session field)."""

    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "timestamp", "created_at"]
        read_only_fields = ["id", "created_at"]


class ChatSessionSerializer(serializers.ModelSerializer):
    """Serializer for ChatSession model with message count."""

    message_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = [
            "id",
            "title",
            "created_at",
            "updated_at",
            "last_message_timestamp",
            "message_count",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "last_message_timestamp"]

    def get_message_count(self, obj) -> int:
        """Get the number of messages in this session."""
        return obj.messages.count()


class ChatSessionDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for ChatSession including recent messages."""

    messages = ChatMessageSerializer(many=True, read_only=True)

    class Meta:
        model = ChatSession
        fields = ["id", "title", "created_at", "updated_at", "last_message_timestamp", "messages"]
        read_only_fields = ["id", "created_at", "updated_at", "last_message_timestamp"]
