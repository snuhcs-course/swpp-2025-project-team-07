"""
Factory Boy factories for chat app models.
"""
import factory
from factory.django import DjangoModelFactory
from faker import Faker
import time

from chat.models import ChatSession, ChatMessage
from user.tests.factories import UserFactory

fake = Faker()


class ChatSessionFactory(DjangoModelFactory):
    """
    Factory for creating ChatSession instances.

    Usage:
        # Create a chat session with default user
        session = ChatSessionFactory()

        # Create with specific user
        session = ChatSessionFactory(user=my_user)

        # Create multiple sessions
        sessions = ChatSessionFactory.create_batch(5)
    """
    class Meta:
        model = ChatSession

    user = factory.SubFactory(UserFactory)
    title = factory.LazyAttribute(lambda _: fake.sentence(nb_words=4).rstrip('.'))
    last_message_timestamp = None


class ChatMessageFactory(DjangoModelFactory):
    """
    Factory for creating ChatMessage instances.

    Usage:
        # Create a message with default session
        message = ChatMessageFactory()

        # Create with specific session and role
        message = ChatMessageFactory(session=my_session, role='assistant')

        # Create multiple messages in order
        messages = ChatMessageFactory.create_batch(
            5,
            session=session,
            timestamp=factory.Sequence(lambda n: int(time.time() * 1000) + n)
        )
    """
    class Meta:
        model = ChatMessage

    session = factory.SubFactory(ChatSessionFactory)
    role = 'user'
    content = factory.LazyAttribute(lambda _: fake.text(max_nb_chars=200))
    timestamp = factory.LazyAttribute(lambda _: int(time.time() * 1000))


class UserChatMessageFactory(ChatMessageFactory):
    """Factory for creating user messages."""
    role = 'user'


class AssistantChatMessageFactory(ChatMessageFactory):
    """Factory for creating assistant messages."""
    role = 'assistant'


class SystemChatMessageFactory(ChatMessageFactory):
    """Factory for creating system messages."""
    role = 'system'
