from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi


# ==================== Collection API Mock Views ====================

@swagger_auto_schema(
    method='get',
    operation_description="[MOCK] List all collections for the authenticated user. Filter by collection_type (TEXT or VIDEO).",
    manual_parameters=[
        openapi.Parameter(
            'collection_type',
            openapi.IN_QUERY,
            description="Filter by collection type",
            type=openapi.TYPE_STRING,
            enum=['TEXT', 'VIDEO'],
            required=False
        )
    ],
    responses={
        200: openapi.Response(
            description="List of collections",
            examples={
                "application/json": [
                    {
                        "collection_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                        "collection_type": "VIDEO",
                        "user_id": 1,
                        "created_at": "2025-01-15T10:30:00Z",
                        "updated_at": "2025-01-15T10:30:00Z"
                    },
                    {
                        "collection_id": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
                        "collection_type": "TEXT",
                        "user_id": 1,
                        "created_at": "2025-01-14T08:20:00Z",
                        "updated_at": "2025-01-14T08:20:00Z"
                    }
                ]
            }
        )
    },
    security=[{'Bearer': []}]
)
@swagger_auto_schema(
    method='post',
    operation_description="[MOCK] Create a new collection",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'collection_type': openapi.Schema(type=openapi.TYPE_STRING, enum=['TEXT', 'VIDEO'])
        },
        required=['collection_type']
    ),
    responses={
        201: openapi.Response(
            description="Collection created",
            examples={
                "application/json": {
                    "collection_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                    "collection_type": "VIDEO",
                    "user_id": 1,
                    "created_at": "2025-01-15T10:30:00Z",
                    "updated_at": "2025-01-15T10:30:00Z"
                }
            }
        )
    },
    security=[{'Bearer': []}]
)
@api_view(['GET', 'POST'])
def mock_collections(request):
    """[MOCK] Collection list/create endpoint - returns mock data"""
    if request.method == 'GET':
        return Response([
            {
                "collection_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "collection_type": "VIDEO",
                "user_id": 1,
                "created_at": "2025-01-15T10:30:00Z",
                "updated_at": "2025-01-15T10:30:00Z"
            },
            {
                "collection_id": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
                "collection_type": "TEXT",
                "user_id": 1,
                "created_at": "2025-01-14T08:20:00Z",
                "updated_at": "2025-01-14T08:20:00Z"
            }
        ])
    else:
        return Response({
            "collection_id": "new-collection-id-12345",
            "collection_type": request.data.get('collection_type', 'TEXT'),
            "user_id": 1,
            "created_at": "2025-01-15T10:30:00Z",
            "updated_at": "2025-01-15T10:30:00Z"
        }, status=status.HTTP_201_CREATED)


@swagger_auto_schema(
    method='post',
    operation_description="[MOCK] Store HE-encrypted vectors and AES-encrypted values. Called every 5 seconds during screen recording or after chat messages.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'keys': openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(type=openapi.TYPE_STRING),
                description="HE-encrypted vector embeddings"
            ),
            'values': openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(type=openapi.TYPE_STRING),
                description="AES-encrypted content/metadata"
            ),
            'metadata': openapi.Schema(
                type=openapi.TYPE_OBJECT,
                description="Additional metadata"
            ),
            'collection_type': openapi.Schema(
                type=openapi.TYPE_STRING,
                enum=['TEXT', 'VIDEO']
            )
        },
        required=['keys', 'values', 'metadata', 'collection_type']
    ),
    responses={
        201: openapi.Response(
            description="Keys stored successfully",
            examples={
                "application/json": {
                    "message": "Keys stored successfully",
                    "collection_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                    "stored_count": 10
                }
            }
        )
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def mock_store_keys(request, collection_id):
    """[MOCK] Store encrypted keys endpoint - returns mock confirmation"""
    return Response({
        "message": "Keys stored successfully",
        "collection_id": collection_id,
        "stored_count": len(request.data.get('keys', [])),
        "metadata": request.data.get('metadata', {})
    }, status=status.HTTP_201_CREATED)


@swagger_auto_schema(
    method='post',
    operation_description="[MOCK] Perform homomorphic search across collections. Returns HE-encrypted similarity scores.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'query_vector': openapi.Schema(
                type=openapi.TYPE_STRING,
                description="HE-encrypted query embedding"
            ),
            'collection_ids': openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(type=openapi.TYPE_STRING),
                description="Collection IDs to search"
            ),
            'collection_types': openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(type=openapi.TYPE_STRING, enum=['TEXT', 'VIDEO'])
            )
        },
        required=['query_vector', 'collection_ids', 'collection_types']
    ),
    responses={
        200: openapi.Response(
            description="Search results with HE-encrypted similarity scores",
            examples={
                "application/json": {
                    "results": [
                        {
                            "collection_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                            "collection_type": "VIDEO",
                            "similarity_scores": [
                                "HE_ENCRYPTED_SCORE_1",
                                "HE_ENCRYPTED_SCORE_2",
                                "HE_ENCRYPTED_SCORE_3"
                            ]
                        },
                        {
                            "collection_id": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
                            "collection_type": "TEXT",
                            "similarity_scores": [
                                "HE_ENCRYPTED_SCORE_4",
                                "HE_ENCRYPTED_SCORE_5"
                            ]
                        }
                    ]
                }
            }
        )
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def mock_search_collections(request):
    """[MOCK] Search collections endpoint - returns mock HE-encrypted scores"""
    collection_ids = request.data.get('collection_ids', [])

    results = []
    for coll_id in collection_ids:
        results.append({
            "collection_id": coll_id,
            "collection_type": "VIDEO" if "video" in coll_id.lower() else "TEXT",
            "similarity_scores": [
                f"HE_ENCRYPTED_SCORE_{coll_id}_{i}" for i in range(5)
            ]
        })

    return Response({"results": results})


@swagger_auto_schema(
    method='post',
    operation_description="[MOCK] Return top-k results using PIR. Returns AES-encrypted data and metadata.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'indices': openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(type=openapi.TYPE_INTEGER),
                description="Top-k indices to return"
            ),
            'collection_type': openapi.Schema(
                type=openapi.TYPE_STRING,
                enum=['TEXT', 'VIDEO']
            )
        },
        required=['indices', 'collection_type']
    ),
    responses={
        200: openapi.Response(
            description="Retrieved encrypted payloads",
            examples={
                "application/json": {
                    "results": [
                        {
                            "index": 0,
                            "encrypted_data": "AES_ENCRYPTED_CONTENT_0",
                            "metadata": {
                                "timestamp": "2025-01-15T10:30:00Z",
                                "frame_id": "frame_001",
                                "activity_type": "screen_recording"
                            }
                        },
                        {
                            "index": 2,
                            "encrypted_data": "AES_ENCRYPTED_CONTENT_2",
                            "metadata": {
                                "timestamp": "2025-01-15T10:30:10Z",
                                "message_id": "msg_003",
                                "activity_type": "chat"
                            }
                        }
                    ]
                }
            }
        )
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def mock_query_collection(request, collection_id):
    """[MOCK] PIR retrieval endpoint - returns mock encrypted data"""
    indices = request.data.get('indices', [])
    collection_type = request.data.get('collection_type', 'TEXT')

    results = []
    for idx in indices:
        results.append({
            "index": idx,
            "encrypted_data": f"AES_ENCRYPTED_CONTENT_{idx}",
            "metadata": {
                "timestamp": "2025-01-15T10:30:00Z",
                "frame_id": f"frame_{idx:03d}" if collection_type == "VIDEO" else None,
                "message_id": f"msg_{idx:03d}" if collection_type == "TEXT" else None,
                "activity_type": "screen_recording" if collection_type == "VIDEO" else "chat"
            }
        })

    return Response({"results": results})
