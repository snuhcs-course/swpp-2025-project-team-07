from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from .vectordb_client import vectordb_client
from .models import VideoSetMetadata

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
    method="post",
    operation_description="Insert data into collection in vectordb. Screen data entries can include optional 'video_set_id' field to group video chunks.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "chat_data": _array_of_objects,
            "screen_data": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=_object_any,
                description="Array of screen recording data. Each entry can optionally include 'video_set_id' (string) to group chunks.",
            ),
            "collection_version": openapi.Schema(
                type=openapi.TYPE_STRING,
                description="Optional version string to append to collection name for testing different client versions",
            ),
        },
        required=[],
    ),
    responses={
        201: openapi.Response(
            description="Data stored successfully",
            examples={
                "application/json": {
                    "ok": True,
                    "result": {"chat_insert_count": 1, "screen_insert_count": 1},
                }
            },
        ),
        400: "Bad Request - Both chat_data and screen_data are empty",
        401: "Unauthorized - Invalid or missing token",
        500: "Server Error - VectorDB operation failed",
    },
    security=[{"Bearer": []}],
)
@api_view(["POST"])
def insert_to_collection(request):
    """Store encrypted vectors and values to chat and/or screen vectordb."""
    chat_data = request.data.get("chat_data")
    screen_data = request.data.get("screen_data")
    collection_version = request.data.get("collection_version")

    # Validate at least one has data
    if not chat_data and not screen_data:
        return Response(
            {"detail": "Both chat_data and screen_data cannot be empty"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Call vectordb in parallel
    success, results, error = vectordb_client.insert_parallel(
        user_id=request.user.id,
        chat_data=chat_data if chat_data else None,
        screen_data=screen_data if screen_data else None,
        collection_version=collection_version,
    )

    if not success:
        return Response({"detail": error}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Store video metadata if screen_data contains video_set_id
    if screen_data:
        _store_video_metadata(request.user.id, screen_data, collection_version)

    return Response({"ok": True, "result": results}, status=status.HTTP_201_CREATED)


@swagger_auto_schema(
    method="post",
    operation_description="Perform homomorphic search across collections. Returns HE-encrypted similarity scores.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "chat_data": _array_of_objects,
            "screen_data": _array_of_objects,
            "collection_version": openapi.Schema(
                type=openapi.TYPE_STRING,
                description="Optional version string to append to collection name for testing different client versions",
            ),
        },
        required=[],
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
            examples={
                "application/json": {
                    "ok": True,
                    "chat_scores": [[0.12, 0.34, 0.56]],
                    "chat_ids": [["id1", "id2", "id3"]],
                    "screen_scores": [[0.12, 0.34, 0.56]],
                    "screen_ids": [["id1", "id2", "id3"]],
                }
            },
        ),
        400: "Bad Request - Both chat_data and screen_data are empty",
        401: "Unauthorized - Invalid or missing token",
        500: "Server Error - VectorDB operation failed",
    },
    security=[{"Bearer": []}],
)
@api_view(["POST"])
def search_collections(request):
    """Search for similar vectors in chat and/or screen vectordb."""
    chat_data = request.data.get("chat_data")
    screen_data = request.data.get("screen_data")
    collection_version = request.data.get("collection_version")

    # Validate at least one has data
    if not chat_data and not screen_data:
        return Response(
            {"detail": "Both chat_data and screen_data cannot be empty"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Call vectordb in parallel
    success, results, error = vectordb_client.search_parallel(
        user_id=request.user.id,
        chat_data=chat_data if chat_data else None,
        screen_data=screen_data if screen_data else None,
        collection_version=collection_version,
    )

    if not success:
        return Response({"detail": error}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response(
        {
            "ok": True,
            "chat_scores": results.get("chat_scores"),
            "chat_ids": results.get("chat_ids"),
            "screen_scores": results.get("screen_scores"),
            "screen_ids": results.get("screen_ids"),
        },
        status=status.HTTP_200_OK,
    )


@swagger_auto_schema(
    method="post",
    operation_description="Query documents by ID and return selected fields. Set 'query_video_sets' to return screen recordings grouped by video set.",
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
            "query_video_sets": openapi.Schema(
                type=openapi.TYPE_BOOLEAN,
                description="If true, return screen results grouped by video_set_id with videos sorted by timestamp within each set",
                default=False,
            ),
            "collection_version": openapi.Schema(
                type=openapi.TYPE_STRING,
                description="Optional version string to append to collection name for testing different client versions",
            ),
        },
        required=[],
    ),
    responses={
        200: openapi.Response(
            description="Retrieved documents. When query_video_sets=true, screen_results is a list of video sets.",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "ok": openapi.Schema(type=openapi.TYPE_BOOLEAN),
                    "chat_results": _array_of_objects,
                    "screen_results": openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(
                            type=openapi.TYPE_OBJECT,
                            properties={
                                "video_set_id": openapi.Schema(type=openapi.TYPE_STRING),
                                "videos": _array_of_objects,
                            },
                        ),
                        description="When query_video_sets=true: list of video sets. Otherwise: flat list of videos.",
                    ),
                },
            ),
            examples={
                "application/json": {
                    "ok": True,
                    "chat_results": [{"id": "msg_001", "text": "hello"}],
                    "screen_results": [
                        {
                            "video_set_id": "set-abc",
                            "videos": [
                                {"id": "screen_100", "timestamp": 1000},
                                {"id": "screen_101", "timestamp": 2000},
                            ],
                        }
                    ],
                }
            },
        ),
        400: "Bad Request - No query parameters provided",
        401: "Unauthorized - Invalid or missing token",
        500: "Server Error - VectorDB operation failed",
    },
    security=[{"Bearer": []}],
)
@api_view(["POST"])
def query_collection(request):
    """Query documents by ID from chat and/or screen vectordb."""
    chat_ids = request.data.get("chat_ids")
    chat_output_fields = request.data.get("chat_output_fields")
    screen_ids = request.data.get("screen_ids")
    screen_output_fields = request.data.get("screen_output_fields")
    collection_version = request.data.get("collection_version")
    query_video_sets = request.data.get("query_video_sets", False)

    # Validate at least one query is provided
    has_chat_query = chat_ids and chat_output_fields
    has_screen_query = screen_ids and screen_output_fields

    if not has_chat_query and not has_screen_query:
        return Response(
            {
                "detail": "Must provide either (chat_ids + chat_output_fields) or (screen_ids + screen_output_fields)"
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Expand screen_ids to include full video sets if requested
    video_set_mapping = None
    if query_video_sets and screen_ids:
        original_screen_ids = screen_ids.copy()  # Preserve original for representative_id
        screen_ids, video_set_mapping = _expand_to_video_sets_with_mapping(
            request.user.id, screen_ids, collection_version
        )

    # Call vectordb in parallel
    success, results, error = vectordb_client.query_parallel(
        user_id=request.user.id,
        chat_ids=chat_ids if has_chat_query else None,
        chat_output_fields=chat_output_fields if has_chat_query else None,
        screen_ids=screen_ids if has_screen_query else None,
        screen_output_fields=screen_output_fields if has_screen_query else None,
        collection_version=collection_version,
    )

    if not success:
        return Response({"detail": error}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Group screen results by video_set_id if requested
    screen_results = results.get("screen_results", [])
    if query_video_sets and video_set_mapping:
        screen_results = _group_by_video_sets(
            screen_results, video_set_mapping, original_screen_ids
        )

    return Response(
        {
            "ok": True,
            "chat_results": results.get("chat_results", []),
            "screen_results": screen_results,
        },
        status=status.HTTP_200_OK,
    )


@swagger_auto_schema(
    method="post",
    operation_description="[DEBUG ONLY] Clear (drop and re-create) chat and/or screen collections for specified user. Collection will be created if it doesn't exist.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "user_id": openapi.Schema(
                type=openapi.TYPE_INTEGER,
                description="User ID",
            ),
            "clear_chat": openapi.Schema(
                type=openapi.TYPE_BOOLEAN,
                description="Whether to clear the chat collection",
            ),
            "clear_screen": openapi.Schema(
                type=openapi.TYPE_BOOLEAN,
                description="Whether to clear the screen collection",
            ),
            "collection_version": openapi.Schema(
                type=openapi.TYPE_STRING,
                description="Optional version string to append to collection name for testing different client versions",
            ),
        },
        required=["user_id", "clear_chat", "clear_screen"],
    ),
    responses={
        200: openapi.Response(
            description="Collections cleared successfully",
            examples={
                "application/json": {
                    "ok": True,
                    "message": "Collections cleared and recreated successfully",
                }
            },
        ),
        400: "Bad Request - Invalid parameters",
        500: "Server Error - VectorDB operation failed",
    },
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def clear_collections(request):
    """Clear (drop and re-create) chat and/or screen collections."""
    user_id = request.data.get("user_id")
    clear_chat = request.data.get("clear_chat", False)
    clear_screen = request.data.get("clear_screen", False)
    collection_version = request.data.get("collection_version")

    # Validate at least one collection is being cleared
    if not clear_chat and not clear_screen:
        return Response(
            {"detail": "At least one of clear_chat or clear_screen must be true"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Drop the collections
    drop_success, drop_error = vectordb_client.drop_collection_parallel(
        user_id=user_id,
        drop_chat=clear_chat,
        drop_screen=clear_screen,
        collection_version=collection_version,
    )

    if not drop_success:
        return Response(
            {"detail": f"Failed to drop collections: {drop_error}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Delete VideoSetMetadata entries when clearing screen collection
    if clear_screen:
        query = VideoSetMetadata.objects.filter(user_id=user_id)
        if collection_version is not None:
            query = query.filter(collection_version=collection_version)
        deleted_count, _ = query.delete()
        print(
            f"[clear_collections] Deleted {deleted_count} VideoSetMetadata entries for user {user_id}"
        )

    # Re-create the collections that were dropped
    if clear_chat or clear_screen:
        create_success, create_error = vectordb_client.create_collections_parallel(
            user_id=user_id,
            create_chat=clear_chat,
            create_screen=clear_screen,
            collection_version=collection_version,
        )

        if not create_success:
            return Response(
                {"detail": f"Failed to re-create collections: {create_error}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    return Response(
        {
            "ok": True,
            "message": "Collections cleared and recreated successfully",
        },
        status=status.HTTP_200_OK,
    )


# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------


def _store_video_metadata(user_id: int, screen_data: list, collection_version: str = None):
    """
    Store video set metadata to database for screen recordings.

    Args:
        user_id: ID of the user who owns the videos
        screen_data: List of screen recording entries from request
        collection_version: Optional collection version string

    Note:
        Only entries with 'video_set_id' field will be stored.
        Uses bulk_create with ignore_conflicts for idempotency.
        Prepends user_id to video_id to ensure uniqueness across users.
    """
    from .models import VideoSetMetadata

    metadata_objects = []
    for entry in screen_data:
        video_set_id = entry.get("video_set_id")
        if video_set_id is not None:  # Only store if video_set_id provided
            # Prepend user_id to video_id for uniqueness across users
            unique_video_id = f"user_{user_id}_{entry['id']}"
            metadata_objects.append(
                VideoSetMetadata(
                    video_id=unique_video_id,
                    video_set_id=str(video_set_id),  # Ensure string type
                    user_id=user_id,
                    timestamp=entry.get("timestamp", 0),
                    collection_version=collection_version,
                )
            )

    if metadata_objects:
        try:
            VideoSetMetadata.objects.bulk_create(
                metadata_objects,
                ignore_conflicts=True,  # Skip if video_id already exists (idempotent)
            )
        except Exception as e:
            # Log error but don't fail the request - metadata is supplementary
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Failed to store video metadata: {e}", exc_info=True)


def _expand_to_video_sets_with_mapping(
    user_id: int, video_ids: list, collection_version: str = None
) -> tuple[list, dict]:
    """
    Expand a list of video IDs to include ALL videos from the same video set(s).

    Args:
        user_id: ID of the user requesting videos (for security isolation)
        video_ids: List of video IDs from client (e.g., ["screen_100"])
        collection_version: Optional collection version to filter by

    Returns:
        Tuple of (expanded_video_ids, mapping) where:
        - expanded_video_ids: List of all video IDs (original format, for vectordb query)
        - mapping: Dict of {original_video_id: {"video_set_id": str, "timestamp": int}}

    Example:
        Input: ["screen_100", "screen_300"]
        Output: (
            ["screen_100", "screen_101", "screen_102", "screen_300", "screen_301"],
            {
                "screen_100": {"video_set_id": "set-A", "timestamp": 1000},
                "screen_101": {"video_set_id": "set-A", "timestamp": 2000},
                ...
            }
        )
    """
    from .models import VideoSetMetadata

    if not video_ids:
        return video_ids, {}

    # Prepend user_id to video_ids for database lookup
    prefixed_video_ids = [f"user_{user_id}_{vid}" for vid in video_ids]

    # Find which video sets these videos belong to
    query = VideoSetMetadata.objects.filter(user_id=user_id, video_id__in=prefixed_video_ids)

    if collection_version:
        query = query.filter(collection_version=collection_version)

    video_set_ids = list(query.values_list("video_set_id", flat=True).distinct())

    if not video_set_ids:
        # No metadata found - return original list without mapping
        return video_ids, {}

    # Get ALL videos from these video sets with their metadata
    full_query = VideoSetMetadata.objects.filter(user_id=user_id, video_set_id__in=video_set_ids)

    if collection_version:
        full_query = full_query.filter(collection_version=collection_version)

    # Build mapping and get IDs
    # Mapping keys should be original video IDs (without user_id prefix) for grouping
    mapping = {}
    original_video_ids = []

    for metadata in full_query.select_related():
        # Remove user_id prefix to get original video_id
        original_video_id = metadata.video_id.replace(f"user_{user_id}_", "", 1)

        mapping[original_video_id] = {
            "video_set_id": metadata.video_set_id,
            "timestamp": metadata.timestamp,
        }
        original_video_ids.append(original_video_id)

    return original_video_ids, mapping


def _group_by_video_sets(videos: list, video_set_mapping: dict, original_screen_ids: list) -> list:
    """
    Group a list of videos by their video_set_id.

    Args:
        videos: List of video objects from vectordb
        video_set_mapping: Dict from _expand_to_video_sets_with_mapping
        original_screen_ids: List of screen IDs from the original request (before expansion)

    Returns:
        List of video sets, each containing:
        {
            "video_set_id": str,
            "representative_id": str,
            "videos": [list of video objects sorted by timestamp]
        }

    Example:
        Input: [
            {"id": "screen_100", "content": "..."},
            {"id": "screen_101", "content": "..."},
            {"id": "screen_200", "content": "..."}
        ]
        Output: [
            {
                "video_set_id": "set-A",
                "representative_id": "screen_100",
                "videos": [
                    {"id": "screen_100", "content": "..."},
                    {"id": "screen_101", "content": "..."}
                ]
            },
            {
                "video_set_id": "set-B",
                "representative_id": "screen_200",
                "videos": [{"id": "screen_200", "content": "..."}]
            }
        ]
    """
    from collections import defaultdict

    # Group videos by video_set_id
    sets = defaultdict(list)

    for video in videos:
        video_id = video.get("id")
        if video_id in video_set_mapping:
            video_set_id = video_set_mapping[video_id]["video_set_id"]
            timestamp = video_set_mapping[video_id]["timestamp"]
            # Add timestamp to video for sorting (if not already present)
            if "timestamp" not in video:
                video["timestamp"] = timestamp
            sets[video_set_id].append(video)
        else:
            # Video not in mapping - shouldn't happen, but handle gracefully
            # Put in a special "unknown" set
            sets["__no_set__"].append(video)

    # Convert to list of video sets, sorted by timestamp within each set
    result = []
    for video_set_id, video_list in sets.items():
        # Sort videos within set by timestamp
        sorted_videos = sorted(video_list, key=lambda v: v.get("timestamp", 0))

        # Find representative_id: the video from original request that appears first
        representative_id = None
        for original_id in original_screen_ids:
            # Check if this original_id is in the current video set
            if any(v.get("id") == original_id for v in video_list):
                representative_id = original_id
                break

        result.append(
            {
                "video_set_id": video_set_id,
                "representative_id": representative_id,
                "videos": sorted_videos,
            }
        )

    # Sort sets by the earliest timestamp in each set
    result.sort(key=lambda s: s["videos"][0].get("timestamp", 0) if s["videos"] else 0)

    return result
