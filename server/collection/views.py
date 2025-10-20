from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

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


@swagger_auto_schema(
    method='post',
    operation_description="Store HE-encrypted vectors and AES-encrypted values. Called every 5 seconds during screen recording or after chat messages.",
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
            examples={"application/json": {"ok": True, "result": {"insert_count": 2}}},
        )
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def store_keys(request):
    return Response({
        "ok": True,
        "result": {
            "chat_insert_count": 1,
            "screen_insert_count": 1
        }
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
                    "screen_scores": _scores_2d_array,
                },
            ),
            examples={"application/json": {
                "ok": True,
                "chat_scores": [[0.12, 0.34, 0.56]],
                "screen_scores": [[0.12, 0.34, 0.56]]
            }},
        ),
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def search_collections(request):
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
    operation_description="(Plaintext Mock) Query documents by id and return selected fields.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "chat_ids": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Items(type=openapi.TYPE_STRING),
                description="List of IDs to fetch",
            ),
            "chat_output_fields": _array_of_strings,
            "screen_ids": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Items(type=openapi.TYPE_STRING),
                description="List of IDs to fetch",
            ),
            "screen_output_fields": _array_of_strings,
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
def query_collection(request):
    indices = request.data.get('indices', )
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
