"""
Unit tests for chat models and serializers.
"""

import pytest
from django.utils import timezone
from freezegun import freeze_time
from rest_framework import serializers as drf_serializers

from chat.models import ChatSession, ChatMessage
from chat.serializers import ChatMessageSerializer
from chat.tests.factories import ChatSessionFactory, ChatMessageFactory, UserChatMessageFactory
from user.tests.factories import UserFactory


@pytest.mark.django_db
class TestChatSessionModel:
    """Tests for the ChatSession model."""

    def test_create_chat_session(self, user):
        """Test creating a chat session."""
        session = ChatSession.objects.create(user=user, title="Test Chat Session")
        assert session.user == user
        assert session.title == "Test Chat Session"
        assert session.created_at is not None
        assert session.updated_at is not None
        assert session.last_message_timestamp is None

    def test_chat_session_str_representation(self, user):
        """Test string representation of ChatSession."""
        session = ChatSessionFactory(user=user, title="My Chat")
        assert str(session) == f"{user.username} - My Chat"

    def test_chat_session_belongs_to_user(self, user):
        """Test that chat session is related to user."""
        session = ChatSessionFactory(user=user)
        assert session in user.chat_sessions.all()

    def test_delete_user_cascades_to_sessions(self):
        """Test that deleting a user deletes their chat sessions."""
        user = UserFactory()
        session = ChatSessionFactory(user=user)
        session_id = session.id

        user.delete()

        assert not ChatSession.objects.filter(id=session_id).exists()

    def test_chat_session_ordering_with_timestamps(self, user):
        """Test that sessions are ordered by last_message_timestamp."""
        session1 = ChatSessionFactory(user=user, last_message_timestamp=1000)
        session2 = ChatSessionFactory(user=user, last_message_timestamp=3000)
        session3 = ChatSessionFactory(user=user, last_message_timestamp=2000)

        sessions = list(ChatSession.objects.all())
        assert sessions[0] == session2  # Highest timestamp first
        assert sessions[1] == session3
        assert sessions[2] == session1

    def test_chat_session_ordering_null_timestamps_first(self, user):
        """Test that sessions with no messages (null timestamp) come first."""
        with freeze_time("2024-01-01"):
            session_with_timestamp = ChatSessionFactory(user=user, last_message_timestamp=1000)
        with freeze_time("2024-01-02"):
            session_without_timestamp = ChatSessionFactory(user=user, last_message_timestamp=None)

        sessions = list(ChatSession.objects.all())
        assert sessions[0] == session_without_timestamp  # Null timestamp first
        assert sessions[1] == session_with_timestamp

    def test_factory_creates_valid_session(self):
        """Test that ChatSessionFactory creates a valid session."""
        session = ChatSessionFactory()
        assert session.user is not None
        assert session.title
        assert ChatSession.objects.filter(id=session.id).exists()


@pytest.mark.django_db
class TestChatMessageModel:
    """Tests for the ChatMessage model."""

    def test_create_chat_message(self, chat_session):
        """Test creating a chat message."""
        message = ChatMessage.objects.create(
            session=chat_session,
            role="user",
            content="Hello, this is a test message",
            timestamp=1234567890000,
        )
        assert message.session == chat_session
        assert message.role == "user"
        assert message.content == "Hello, this is a test message"
        assert message.timestamp == 1234567890000

    def test_chat_message_role_choices(self, chat_session):
        """Test that only valid roles are accepted."""
        # Valid roles
        for role in ["user", "assistant", "system"]:
            message = ChatMessage.objects.create(
                session=chat_session, role=role, content="Test", timestamp=1000
            )
            assert message.role == role

    def test_chat_message_str_representation(self, chat_session):
        """Test string representation of ChatMessage."""
        message = ChatMessageFactory(
            session=chat_session,
            role="user",
            content="This is a long message that should be truncated in the string representation",
        )
        str_repr = str(message)
        assert chat_session.title in str_repr
        assert "user" in str_repr
        assert len(str_repr) < 100  # Ensures truncation

    def test_chat_message_belongs_to_session(self, chat_session):
        """Test that message is related to session."""
        message = ChatMessageFactory(session=chat_session)
        assert message in chat_session.messages.all()

    def test_delete_session_cascades_to_messages(self, user):
        """Test that deleting a session deletes its messages."""
        session = ChatSessionFactory(user=user)
        message = ChatMessageFactory(session=session)
        message_id = message.id

        session.delete()

        assert not ChatMessage.objects.filter(id=message_id).exists()

    def test_chat_message_ordering_by_timestamp(self, chat_session):
        """Test that messages are ordered by timestamp."""
        message3 = ChatMessageFactory(session=chat_session, timestamp=3000)
        message1 = ChatMessageFactory(session=chat_session, timestamp=1000)
        message2 = ChatMessageFactory(session=chat_session, timestamp=2000)

        messages = list(chat_session.messages.all())
        assert messages[0] == message1
        assert messages[1] == message2
        assert messages[2] == message3

    def test_factory_creates_valid_message(self):
        """Test that ChatMessageFactory creates a valid message."""
        message = ChatMessageFactory()
        assert message.session is not None
        assert message.role in ["user", "assistant", "system"]
        assert message.content
        assert message.timestamp > 0

    def test_conversation_flow(self, user):
        """Test creating a realistic conversation flow."""
        session = ChatSessionFactory(user=user, title="Tech Support")

        # User asks question
        user_msg = ChatMessage.objects.create(
            session=session, role="user", content="How do I reset my password?", timestamp=1000
        )

        # Assistant responds
        assistant_msg = ChatMessage.objects.create(
            session=session,
            role="assistant",
            content='You can reset your password by clicking the "Forgot Password" link.',
            timestamp=2000,
        )

        # User follows up
        user_followup = ChatMessage.objects.create(
            session=session, role="user", content="Thanks! That worked.", timestamp=3000
        )

        messages = list(session.messages.all())
        assert len(messages) == 3
        assert messages[0] == user_msg
        assert messages[1] == assistant_msg
        assert messages[2] == user_followup


@pytest.mark.django_db
class TestChatMessageSerializer:
    """Tests for ChatMessageSerializer validation."""

    def test_validate_role_with_valid_roles(self, chat_session):
        """Test that valid roles pass validation."""
        for role in ["user", "assistant", "system"]:
            data = {
                "session": chat_session.id,
                "role": role,
                "content": "Test message",
                "timestamp": 1234567890000,
            }
            serializer = ChatMessageSerializer(data=data)
            assert serializer.is_valid(), f"Role '{role}' should be valid"

    def test_validate_role_with_invalid_role(self, chat_session):
        """Test that invalid role raises validation error."""
        data = {
            "session": chat_session.id,
            "role": "invalid_role",
            "content": "Test message",
            "timestamp": 1234567890000,
        }
        serializer = ChatMessageSerializer(data=data)
        assert not serializer.is_valid()
        assert "role" in serializer.errors
        # Check that error message mentions invalid choice or invalid role
        error_message = str(serializer.errors["role"][0]).lower()
        assert "invalid" in error_message or "not a valid choice" in error_message
