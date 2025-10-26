from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from .vectordb_client import vectordb_client

# -----------------------------------------------------------------------------
# OpenAPI Schemas (drf-yasg)
# -----------------------------------------------------------------------------
_object_any = openapi.Schema(type=openapi.TYPE_OBJECT, description="Arbitrary JSON object")

_array_of_objects = openapi.Schema(
    type=openapi.TYPE_ARRAY,
    items=_object_any,
    description="List of JSON objects",
)

_array_of_strings = openapi.Schema(
    type=openapi.TYPE_ARRAY,
    items=openapi.Items(type=openapi.TYPE_STRING),
)

_array_of_numbers = openapi.Schema(
    type=openapi.TYPE_ARRAY,
    items=openapi.Items(type=openapi.TYPE_NUMBER, format=openapi.FORMAT_DOUBLE),
)

_scores_2d_array = openapi.Schema(
    type=openapi.TYPE_ARRAY,
    items=_array_of_numbers,
    description="Scores for each query vector (per-query list of numbers)",
)

_strings_2d_array = openapi.Schema(
    type=openapi.TYPE_ARRAY,
    items=_array_of_strings,
    description="IDs for each query vector (per-query list of strings)",
)


@swagger_auto_schema(
    method='post',
    operation_description="Insert data into collection in vectordb.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'chat_data': _array_of_objects,
            'screen_data': _array_of_objects,
        },
        required=[]
    ),
    responses={
        201: openapi.Response(
            description="Data stored successfully",
            examples={"application/json": {"ok": True, "result": {"chat_insert_count": 1, "screen_insert_count": 1}}},
        ),
        400: "Bad Request - Both chat_data and screen_data are empty",
        401: "Unauthorized - Invalid or missing token",
        500: "Server Error - VectorDB operation failed"
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def insert_to_collection(request):
    """Store encrypted vectors and values to chat and/or screen vectordb."""
    # Verify user is authenticated
    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication required"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    chat_data = request.data.get('chat_data')
    screen_data = request.data.get('screen_data')

    # Validate at least one has data
    if not chat_data and not screen_data:
        return Response(
            {"detail": "Both chat_data and screen_data cannot be empty"},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Call vectordb in parallel
    success, results, error = vectordb_client.insert_parallel(
        user_id=request.user.id,
        chat_data=chat_data if chat_data else None,
        screen_data=screen_data if screen_data else None,
    )

    if not success:
        return Response(
            {"detail": error},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return Response({
        "ok": True,
        "result": results
    }, status=status.HTTP_201_CREATED)


@swagger_auto_schema(
    method='post',
    operation_description="(Plaintext Mock) Perform homomorphic search across collections. Returns HE-encrypted similarity scores.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'chat_data': _array_of_objects,
            'screen_data': _array_of_objects,
        },
        required=[]
    ),
    responses={
        200: openapi.Response(
            description="Scores returned",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "ok": openapi.Schema(type=openapi.TYPE_BOOLEAN),
                    "chat_scores": _scores_2d_array,
                    "chat_ids": _strings_2d_array,
                    "screen_scores": _scores_2d_array,
                    "screen_ids": _strings_2d_array,
                },
            ),
            examples={"application/json": {
                "ok": True,
                "chat_scores": [[0.12, 0.34, 0.56]],
                "chat_ids": [["id1", "id2", "id3"]],
                "screen_scores": [[0.12, 0.34, 0.56]],
                "screen_ids": [["id1", "id2", "id3"]],
            }},
        ),
        400: "Bad Request - Both chat_data and screen_data are empty",
        401: "Unauthorized - Invalid or missing token",
        500: "Server Error - VectorDB operation failed"
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def search_collections(request):
    """Search for similar vectors in chat and/or screen vectordb."""
    # Verify user is authenticated
    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication required"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    chat_data = request.data.get('chat_data')
    screen_data = request.data.get('screen_data')

    # Validate at least one has data
    if not chat_data and not screen_data:
        return Response(
            {"detail": "Both chat_data and screen_data cannot be empty"},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Call vectordb in parallel
    success, results, error = vectordb_client.search_parallel(
        user_id=request.user.id,
        chat_data=chat_data if chat_data else None,
        screen_data=screen_data if screen_data else None,
    )

    if not success:
        return Response(
            {"detail": error},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return Response({
        "ok": True,
        "chat_scores": results.get('chat_scores'),
        "chat_ids": results.get('chat_ids'),
        "screen_scores": results.get('screen_scores'),
        "screen_ids": results.get('screen_ids'),
    }, status=status.HTTP_200_OK)


@swagger_auto_schema(
    method='post',
    operation_description="(Plaintext Mock) Query documents by ID and return selected fields.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "chat_ids": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Items(type=openapi.TYPE_STRING),
                description="List of chat document IDs to fetch",
            ),
            "chat_output_fields": _array_of_strings,
            "screen_ids": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Items(type=openapi.TYPE_STRING),
                description="List of screen document IDs to fetch",
            ),
            "screen_output_fields": _array_of_strings,
        },
        required=[]
    ),
    responses={
        200: openapi.Response(
            description="Retrieved documents",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "ok": openapi.Schema(type=openapi.TYPE_BOOLEAN),
                    "chat_results": _array_of_objects,
                    "screen_results": _array_of_objects,
                },
            ),
            examples={
                "application/json": {
                    "ok": True,
                    "chat_results": [
                        {"id": "msg_001", "text": "hello"}
                    ],
                    "screen_results": [
                        {"id": "msg_002", "text": "world"}
                    ]
                }
            }
        ),
        400: "Bad Request - No query parameters provided",
        401: "Unauthorized - Invalid or missing token",
        500: "Server Error - VectorDB operation failed"
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def query_collection(request):
    """Query documents by ID from chat and/or screen vectordb."""
    # Verify user is authenticated
    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication required"},
            status=status.HTTP_401_UNAUTHORIZED
        )

    chat_ids = request.data.get('chat_ids')
    chat_output_fields = request.data.get('chat_output_fields')
    screen_ids = request.data.get('screen_ids')
    screen_output_fields = request.data.get('screen_output_fields')

    # Validate at least one query is provided
    has_chat_query = chat_ids and chat_output_fields
    has_screen_query = screen_ids and screen_output_fields

    if not has_chat_query and not has_screen_query:
        return Response(
            {"detail": "Must provide either (chat_ids + chat_output_fields) or (screen_ids + screen_output_fields)"},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Call vectordb in parallel
    success, results, error = vectordb_client.query_parallel(
        user_id=request.user.id,
        chat_ids=chat_ids if has_chat_query else None,
        chat_output_fields=chat_output_fields if has_chat_query else None,
        screen_ids=screen_ids if has_screen_query else None,
        screen_output_fields=screen_output_fields if has_screen_query else None,
    )

    if not success:
        return Response(
            {"detail": error},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return Response({
        "ok": True,
        "chat_results": results.get('chat_results', []),
        "screen_results": results.get('screen_results', []),
    }, status=status.HTTP_200_OK)
