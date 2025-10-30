"""
Integration tests for chat views/API endpoints.
"""
import pytest
from django.urls import reverse
from rest_framework import status

from chat.models import ChatSession, ChatMessage
from chat.tests.factories import ChatSessionFactory, ChatMessageFactory


@pytest.mark.django_db
class TestSessionViews:
    """Tests for chat session API endpoints."""

    def test_list_sessions_authenticated(self, jwt_authenticated_client, user):
        """Test listing sessions for authenticated user."""
        # Create sessions for the user
        ChatSessionFactory.create_batch(3, user=user)
        # Create sessions for another user (should not appear)
        ChatSessionFactory.create_batch(2)

        url = reverse('list_sessions')
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3

    def test_list_sessions_unauthenticated(self, api_client):
        """Test that unauthenticated users cannot list sessions."""
        url = reverse('list_sessions')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_session(self, jwt_authenticated_client, user):
        """Test creating a new chat session."""
        url = reverse('create_session')
        data = {'title': 'My New Chat Session'}
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['title'] == 'My New Chat Session'
        assert ChatSession.objects.filter(user=user, title='My New Chat Session').exists()

    def test_create_session_without_title(self, jwt_authenticated_client):
        """Test that creating a session without title fails."""
        url = reverse('create_session')
        data = {}
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_get_session(self, jwt_authenticated_client, chat_session_with_messages):
        """Test retrieving a specific session with its messages."""
        url = reverse('get_session', kwargs={'session_id': chat_session_with_messages.id})
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == chat_session_with_messages.id
        assert response.data['title'] == chat_session_with_messages.title
        assert 'messages' in response.data
        assert len(response.data['messages']) == 4

    def test_get_session_not_owned_by_user(self, jwt_authenticated_client):
        """Test that user cannot access another user's session."""
        other_session = ChatSessionFactory()  # Different user
        url = reverse('get_session', kwargs={'session_id': other_session.id})
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_session_title(self, jwt_authenticated_client, chat_session):
        """Test updating a session's title."""
        url = reverse('update_session', kwargs={'session_id': chat_session.id})
        data = {'title': 'Updated Title'}
        response = jwt_authenticated_client.patch(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['title'] == 'Updated Title'
        chat_session.refresh_from_db()
        assert chat_session.title == 'Updated Title'

    def test_update_session_with_invalid_data(self, jwt_authenticated_client, chat_session):
        """Test updating a session with invalid data returns 400."""
        url = reverse('update_session', kwargs={'session_id': chat_session.id})
        # Send empty title which should fail validation
        data = {'title': ''}
        response = jwt_authenticated_client.patch(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_session(self, jwt_authenticated_client, chat_session):
        """Test deleting a chat session."""
        session_id = chat_session.id
        url = reverse('delete_session', kwargs={'session_id': session_id})
        response = jwt_authenticated_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ChatSession.objects.filter(id=session_id).exists()

    def test_delete_session_cascades_to_messages(self, jwt_authenticated_client, chat_session_with_messages):
        """Test that deleting a session also deletes its messages."""
        session_id = chat_session_with_messages.id
        message_ids = list(chat_session_with_messages.messages.values_list('id', flat=True))

        url = reverse('delete_session', kwargs={'session_id': session_id})
        response = jwt_authenticated_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ChatSession.objects.filter(id=session_id).exists()
        # Verify all messages were also deleted
        assert not ChatMessage.objects.filter(id__in=message_ids).exists()


@pytest.mark.django_db
class TestMessageViews:
    """Tests for chat message API endpoints."""

    def test_list_messages_with_pagination(self, jwt_authenticated_client, chat_session_with_messages):
        """Test listing messages with pagination."""
        url = reverse('list_messages', kwargs={'session_id': chat_session_with_messages.id})
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) == 4

    def test_list_messages_without_pagination(self, jwt_authenticated_client, chat_session):
        """Test listing all messages without pagination."""
        # Create many messages
        ChatMessageFactory.create_batch(60, session=chat_session)

        url = reverse('list_messages', kwargs={'session_id': chat_session.id})
        response = jwt_authenticated_client.get(url, {'page_size': '0'})

        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)
        assert len(response.data) == 60

    def test_list_messages_for_nonexistent_session(self, jwt_authenticated_client):
        """Test listing messages for non-existent session returns 404."""
        url = reverse('list_messages', kwargs={'session_id': 99999})
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_create_message(self, jwt_authenticated_client, chat_session):
        """Test creating a new message in a session."""
        url = reverse('create_message', kwargs={'session_id': chat_session.id})
        data = {
            'role': 'user',
            'content': 'Hello, this is a test message',
            'timestamp': 1234567890000
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['role'] == 'user'
        assert response.data['content'] == 'Hello, this is a test message'
        assert response.data['timestamp'] == 1234567890000

        # Verify session's last_message_timestamp was updated
        chat_session.refresh_from_db()
        assert chat_session.last_message_timestamp == 1234567890000

    def test_create_message_with_invalid_role(self, jwt_authenticated_client, chat_session):
        """Test creating a message with invalid role fails."""
        url = reverse('create_message', kwargs={'session_id': chat_session.id})
        data = {
            'role': 'invalid_role',
            'content': 'Test message',
            'timestamp': 1234567890000
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_message_updates_session_timestamp(self, jwt_authenticated_client, chat_session):
        """Test that creating messages updates session's last_message_timestamp."""
        url = reverse('create_message', kwargs={'session_id': chat_session.id})

        # Create first message
        data1 = {'role': 'user', 'content': 'First message', 'timestamp': 1000}
        jwt_authenticated_client.post(url, data1, format='json')
        chat_session.refresh_from_db()
        assert chat_session.last_message_timestamp == 1000

        # Create second message with later timestamp
        data2 = {'role': 'assistant', 'content': 'Second message', 'timestamp': 2000}
        jwt_authenticated_client.post(url, data2, format='json')
        chat_session.refresh_from_db()
        assert chat_session.last_message_timestamp == 2000

    def test_get_message(self, jwt_authenticated_client, chat_session):
        """Test retrieving a specific message."""
        message = ChatMessageFactory(session=chat_session)
        url = reverse('get_message', kwargs={'message_id': message.id})
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == message.id
        assert response.data['content'] == message.content

    def test_get_message_not_owned_by_user(self, jwt_authenticated_client):
        """Test that user cannot access another user's messages."""
        other_message = ChatMessageFactory()  # Different user's session
        url = reverse('get_message', kwargs={'message_id': other_message.id})
        response = jwt_authenticated_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_message_content(self, jwt_authenticated_client, chat_session):
        """Test updating a message's content."""
        message = ChatMessageFactory(session=chat_session, content='Original content')
        url = reverse('update_message', kwargs={'message_id': message.id})
        data = {'content': 'Updated content'}
        response = jwt_authenticated_client.patch(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['content'] == 'Updated content'
        message.refresh_from_db()
        assert message.content == 'Updated content'

    def test_update_message_with_invalid_data(self, jwt_authenticated_client, chat_session):
        """Test updating a message with invalid data returns 400."""
        message = ChatMessageFactory(session=chat_session)
        url = reverse('update_message', kwargs={'message_id': message.id})
        # Send empty content which should fail validation
        data = {'content': ''}
        response = jwt_authenticated_client.patch(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_message(self, jwt_authenticated_client, chat_session):
        """Test deleting a message."""
        message = ChatMessageFactory(session=chat_session)
        message_id = message.id
        url = reverse('delete_message', kwargs={'message_id': message_id})
        response = jwt_authenticated_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ChatMessage.objects.filter(id=message_id).exists()

    def test_message_ordering_by_timestamp(self, jwt_authenticated_client, chat_session):
        """Test that messages are returned in timestamp order."""
        # Create messages in non-sequential order
        msg3 = ChatMessageFactory(session=chat_session, timestamp=3000)
        msg1 = ChatMessageFactory(session=chat_session, timestamp=1000)
        msg2 = ChatMessageFactory(session=chat_session, timestamp=2000)

        url = reverse('list_messages', kwargs={'session_id': chat_session.id})
        response = jwt_authenticated_client.get(url, {'page_size': '0'})

        assert response.status_code == status.HTTP_200_OK
        timestamps = [msg['timestamp'] for msg in response.data]
        assert timestamps == [1000, 2000, 3000]
