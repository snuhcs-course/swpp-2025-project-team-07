"""
Chat app specific test fixtures.
"""

import pytest
from chat.tests.factories import (
    ChatSessionFactory,
    ChatMessageFactory,
    UserChatMessageFactory,
    AssistantChatMessageFactory,
)


@pytest.fixture
def chat_session(user):
    """Creates a chat session for the default test user."""
    return ChatSessionFactory(user=user)


@pytest.fixture
def chat_session_with_messages(user):
    """Creates a chat session with multiple messages."""
    session = ChatSessionFactory(user=user)
    # Create alternating user and assistant messages
    UserChatMessageFactory(session=session, timestamp=1000)
    AssistantChatMessageFactory(session=session, timestamp=2000)
    UserChatMessageFactory(session=session, timestamp=3000)
    AssistantChatMessageFactory(session=session, timestamp=4000)
    return session


@pytest.fixture
def multiple_chat_sessions(user):
    """Creates multiple chat sessions for testing."""
    return ChatSessionFactory.create_batch(3, user=user)
