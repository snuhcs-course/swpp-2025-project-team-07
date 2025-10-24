from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from django.shortcuts import get_object_or_404

from .models import ChatSession, ChatMessage
from .serializers import (
    ChatSessionSerializer,
    ChatSessionDetailSerializer,
    ChatMessageSerializer,
    ChatMessageCreateSerializer,
)


# -----------------------------------------------------------------------------
# Session Views
# -----------------------------------------------------------------------------

@swagger_auto_schema(
    method='get',
    operation_description="List all chat sessions for the authenticated user. Sessions are ordered by the timestamp of the most recent message.",
    responses={
        200: openapi.Response(
            description="List of chat sessions",
            schema=ChatSessionSerializer(many=True),
        ),
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['GET'])
def list_sessions(request):
    """List all chat sessions for the authenticated user."""
    sessions = ChatSession.objects.filter(user=request.user)
    serializer = ChatSessionSerializer(sessions, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@swagger_auto_schema(
    method='post',
    operation_description="Create a new chat session",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'title': openapi.Schema(type=openapi.TYPE_STRING, description='Session title'),
        },
        required=['title']
    ),
    responses={
        201: openapi.Response(
            description="Session created successfully",
            schema=ChatSessionSerializer,
        ),
        400: "Bad Request",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def create_session(request):
    """Create a new chat session."""
    serializer = ChatSessionSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='get',
    operation_description="Get a specific chat session with all messages",
    responses={
        200: openapi.Response(
            description="Session details",
            schema=ChatSessionDetailSerializer,
        ),
        404: "Session not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['GET'])
def get_session(request, session_id):
    """Get a specific chat session with all messages."""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    serializer = ChatSessionDetailSerializer(session)
    return Response(serializer.data, status=status.HTTP_200_OK)


@swagger_auto_schema(
    method='patch',
    operation_description="Update a chat session (title only)",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'title': openapi.Schema(type=openapi.TYPE_STRING, description='New session title'),
        },
        required=['title']
    ),
    responses={
        200: openapi.Response(
            description="Session updated successfully",
            schema=ChatSessionSerializer,
        ),
        400: "Bad Request",
        404: "Session not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['PATCH'])
def update_session(request, session_id):
    """Update a chat session (title only)."""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    serializer = ChatSessionSerializer(session, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='delete',
    operation_description="Delete a chat session and all its messages",
    responses={
        204: "Session deleted successfully",
        404: "Session not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['DELETE'])
def delete_session(request, session_id):
    """Delete a chat session and all its messages."""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    session.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# -----------------------------------------------------------------------------
# Message Views
# -----------------------------------------------------------------------------

class MessagePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


@swagger_auto_schema(
    method='get',
    operation_description="List all messages in a session. Supports pagination (default 50 per page). Set page_size=0 to disable pagination and fetch all messages. Messages are ordered in descending order by client-generated epoch timestamp.",
    manual_parameters=[
        openapi.Parameter(
            'page',
            openapi.IN_QUERY,
            description="Page number",
            type=openapi.TYPE_INTEGER
        ),
        openapi.Parameter(
            'page_size',
            openapi.IN_QUERY,
            description="Number of messages per page (set to 0 to disable pagination)",
            type=openapi.TYPE_INTEGER
        ),
    ],
    responses={
        200: openapi.Response(
            description="List of messages",
            schema=ChatMessageSerializer(many=True),
        ),
        404: "Session not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['GET'])
def list_messages(request, session_id):
    """List all messages in a session with optional pagination."""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    messages = session.messages.all()

    # Check if pagination should be disabled
    page_size = request.query_params.get('page_size')
    if page_size == '0':
        # Return all messages without pagination
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # Use pagination
    paginator = MessagePagination()
    paginated_messages = paginator.paginate_queryset(messages, request)
    serializer = ChatMessageSerializer(paginated_messages, many=True)
    return paginator.get_paginated_response(serializer.data)


@swagger_auto_schema(
    method='post',
    operation_description="Create a new message in a session. Updates session.last_message_timestamp automatically.",
    request_body=ChatMessageCreateSerializer,
    responses={
        201: openapi.Response(
            description="Message created successfully",
            schema=ChatMessageSerializer,
        ),
        400: "Bad Request",
        404: "Session not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def create_message(request, session_id):
    """Create a new message in a session."""
    session = get_object_or_404(ChatSession, id=session_id, user=request.user)
    serializer = ChatMessageCreateSerializer(data=request.data)
    if serializer.is_valid():
        message = serializer.save(session=session)

        # Update session's last_message_timestamp
        session.last_message_timestamp = message.timestamp
        session.save(update_fields=['last_message_timestamp'])

        return Response(ChatMessageSerializer(message).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='get',
    operation_description="Get a specific message by ID",
    responses={
        200: openapi.Response(
            description="Message details",
            schema=ChatMessageSerializer,
        ),
        404: "Message not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['GET'])
def get_message(request, message_id):
    """Get a specific message by ID."""
    message = get_object_or_404(ChatMessage, id=message_id, session__user=request.user)
    serializer = ChatMessageSerializer(message)
    return Response(serializer.data, status=status.HTTP_200_OK)


@swagger_auto_schema(
    method='patch',
    operation_description="Update a message (content only)",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'content': openapi.Schema(type=openapi.TYPE_STRING, description='New message content'),
        },
        required=['content']
    ),
    responses={
        200: openapi.Response(
            description="Message updated successfully",
            schema=ChatMessageSerializer,
        ),
        400: "Bad Request",
        404: "Message not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['PATCH'])
def update_message(request, message_id):
    """Update a message (content only)."""
    message = get_object_or_404(ChatMessage, id=message_id, session__user=request.user)
    session = message.session
    serializer = ChatMessageSerializer(message, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()

        # Update session's last_message_timestamp
        session.last_message_timestamp = message.timestamp
        session.save(update_fields=['last_message_timestamp'])

        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='delete',
    operation_description="Delete a message",
    responses={
        204: "Message deleted successfully",
        404: "Message not found",
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['DELETE'])
def delete_message(request, message_id):
    """Delete a message."""
    message = get_object_or_404(ChatMessage, id=message_id, session__user=request.user)
    message.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
