from __future__ import annotations

import os
import threading
from typing import Any, Dict, List, Optional, Union

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from pathlib import Path
from dotenv import load_dotenv
import numpy as np

from .vectordb.milvus_vectordb import MilvusVectorDB


# -----------------------------------------------------------------------------
# Env Variables
# -----------------------------------------------------------------------------
# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file
load_dotenv(BASE_DIR / '.env')


# -----------------------------------------------------------------------------
# Milvus DB Singleton
# -----------------------------------------------------------------------------
_db_lock = threading.Lock()
_db_instance: Optional[MilvusVectorDB] = None


def _resolve_uri() -> Optional[str]:
    uri = os.getenv("VECTOR_DATABASE_URI")
    if not uri:
        raise ValueError("VECTOR_DATABASE_URI is not set in environment variables.")
    # If file path, ensure directory exists
    if os.path.sep in uri and not uri.startswith(("http://", "https://")):
        os.makedirs(os.path.dirname(uri), exist_ok=True)
    return uri


def _ensure_db() -> Union[MilvusVectorDB, Response]:
    global _db_instance
    if _db_instance is not None:
        return _db_instance

    with _db_lock:
        if _db_instance is not None:
            return _db_instance

        uri = _resolve_uri()
        try:
            instance = MilvusVectorDB(uri=uri)
            # Test connection
            _ = instance.get_uri()
            _db_instance = instance
            return _db_instance
        except Exception as e:
            return Response(
                {"detail": f"Failed to initialize Milvus client: {e}", "uri_tried": uri},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _require_fields(payload: Dict[str, Any], fields: List[str]) -> Optional[Response]:
    missing = [f for f in fields if f not in payload]
    if missing:
        return Response(
            {"detail": f"Missing required field(s): {', '.join(missing)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _normalize_vectors_to_float32(objs) -> List[List[float]]:
    if not isinstance(objs, list) or len(objs) == 0:
        raise ValueError("data must be a non-empty list of vectors.")

    if isinstance(objs[0], dict):
        try:
            mat = [row["vector"] for row in objs]
        except Exception:
            raise ValueError("When using dict format, each item must have a 'vector' key.")
    else:
        mat = objs

    if any(not isinstance(row, (list, tuple)) for row in mat):
        raise ValueError("Each vector must be a list/tuple of numbers.")

    arr = np.asarray(mat, dtype=np.float32)
    if arr.ndim != 2:
        raise ValueError(f"data must be a 2D array-like. Got shape {arr.shape}.")
    if not np.isfinite(arr).all():
        raise ValueError("Vectors contain NaN/Inf.")
    return arr.tolist()


# -----------------------------------------------------------------------------
# OpenAPI Schemas (drf-yasg)
# -----------------------------------------------------------------------------
_collection_name_prop = openapi.Schema(type=openapi.TYPE_STRING, description="Collection name")

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


# -----------------------------------------------------------------------------
# Views
# -----------------------------------------------------------------------------
@swagger_auto_schema(
    method="post",
    operation_description="Create a new Milvus collection.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "collection_name": _collection_name_prop,
            "dimension": openapi.Schema(type=openapi.TYPE_INTEGER, description="Vector dimension (>0)"),
            "metric_type": openapi.Schema(
                type=openapi.TYPE_STRING,
                enum=["L2", "IP", "COSINE"],
                description="Similarity metric",
            ),
            "id_type": openapi.Schema(
                type=openapi.TYPE_STRING,
                enum=["int", "string"],
                description="Primary key type",
            ),
        },
        required=["collection_name", "dimension", "metric_type", "id_type"],
    ),
    responses={
        201: openapi.Response(description="Collection created", examples={"application/json": {"ok": True}}),
        400: "Bad Request",
        500: "Server Error",
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def vectordb_create_collection(request):
    db = _ensure_db()
    if isinstance(db, Response):
        return db

    err = _require_fields(request.data, ["collection_name", "dimension", "metric_type", "id_type"])
    if err:
        return err

    collection_name = request.data["collection_name"]
    dimension = request.data["dimension"]
    metric_type = request.data["metric_type"]
    id_type = request.data["id_type"]

    try:
        db.create_collection(
            collection_name=collection_name,
            dimension=int(dimension),
            metric_type=str(metric_type),
            id_type=str(id_type),
        )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
    except AssertionError as e:
        return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"detail": f"Failed to create collection: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method="post",
    operation_description="Drop an existing collection.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={"collection_name": _collection_name_prop},
        required=["collection_name"],
    ),
    responses={
        200: openapi.Response(description="Collection dropped", examples={"application/json": {"ok": True}}),
        500: "Server Error",
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def vectordb_drop_collection(request):
    db = _ensure_db()
    if isinstance(db, Response):
        return db

    err = _require_fields(request.data, ["collection_name"])
    if err:
        return err

    collection_name = request.data["collection_name"]
    try:
        db.drop_collection(collection_name=collection_name)
        return Response({"ok": True}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"Failed to drop collection: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method="post",
    operation_description="Insert entities into a collection.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "collection_name": _collection_name_prop,
            "data": _array_of_objects,
        },
        required=["collection_name", "data"],
    ),
    responses={
        200: openapi.Response(
            description="Insert succeeded",
            examples={"application/json": {"ok": True, "result": {"insert_count": 2}}},
        ),
        400: "Bad Request",
        500: "Server Error",
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def vectordb_insert(request):
    db = _ensure_db()
    if isinstance(db, Response):
        return db

    err = _require_fields(request.data, ["collection_name", "data"])
    if err:
        return err

    collection_name = request.data["collection_name"]
    rows = request.data["data"]

    if not isinstance(rows, list) or not all(isinstance(x, dict) for x in rows):
        return Response({"detail": "data must be a list of objects (List[Dict])."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        rows_norm = []
        for r in rows:
            if "vector" in r and r["vector"] is not None:
                vec = _normalize_vectors_to_float32([r["vector"]])[0]
                r = {**r, "vector": vec}
            rows_norm.append(r)

        res = db.insert(collection_name=collection_name, data=rows_norm)
        return Response({"ok": True, "result": res}, status=status.HTTP_200_OK)
    except ValueError as ve:
        return Response({"detail": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"detail": f"Failed to insert: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method="post",
    operation_description="Delete entities by IDs.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "collection_name": _collection_name_prop,
            "ids": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Items(type=openapi.TYPE_STRING),
                description="List of IDs to delete",
            ),
        },
        required=["collection_name", "ids"],
    ),
    responses={
        200: openapi.Response(
            description="Delete succeeded",
            examples={"application/json": {"ok": True, "result": {"delete_count": 2}}},
        ),
        400: "Bad Request",
        500: "Server Error",
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def vectordb_delete(request):
    db = _ensure_db()
    if isinstance(db, Response):
        return db

    err = _require_fields(request.data, ["collection_name", "ids"])
    if err:
        return err

    collection_name = request.data["collection_name"]
    ids = request.data["ids"]

    if not isinstance(ids, list) or not all(isinstance(x, (str, int)) for x in ids):
        return Response({"detail": "ids must be a list of strings/ints."}, status=status.HTTP_400_BAD_REQUEST)

    ids = [str(x) for x in ids]
    try:
        res = db.delete(collection_name=collection_name, ids=ids)
        return Response({"ok": True, "result": res}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"Failed to delete: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method="post",
    operation_description=(
        "Vector search. Returns ONLY similarity scores for all matches."
    ),
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "collection_name": _collection_name_prop,
            "data": _array_of_objects,
        },
        required=["collection_name", "data"],
    ),
    responses={
        200: openapi.Response(
            description="Scores returned",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "ok": openapi.Schema(type=openapi.TYPE_BOOLEAN),
                    "scores": _scores_2d_array,
                    "ids": _strings_2d_array,
                },
            ),
            examples={"application/json": {"ok": True, "scores": [[0.12, 0.34, 0.56]], "ids": [["a1", "a2", "a3"]]}},
        ),
        400: "Bad Request",
        500: "Server Error",
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def vectordb_search(request):
    db = _ensure_db()
    if isinstance(db, Response):
        return db

    err = _require_fields(request.data, ["collection_name", "data"])
    if err:
        return err

    collection_name = request.data["collection_name"]
    data = request.data["data"]

    try:
        vectors = _normalize_vectors_to_float32(data)
        MAX_LIMIT = 16384
        res = db.search(
            collection_name=collection_name,
            data=vectors,
            limit=MAX_LIMIT,
            output_fields=["id"],
        )

        scores: List[List[float]] = []
        ids: List[List[str]] = []
        for hits in res:
            query_scores = []
            query_ids = []
            for h in hits:
                if "distance" not in h:
                    return Response(
                        {"detail": "Unknown hit format from Milvus. Expected {'entry': {...}, 'distance': float}."},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                query_scores.append(float(h["distance"]))
                print("[h]", h)
                query_ids.append(str(h["entity"]["id"]))
            scores.append(query_scores)
            ids.append(query_ids)

        return Response(
            {"ok": True, "scores": scores, "ids": ids},
            status=status.HTTP_200_OK
        )

    except ValueError as ve:
        return Response({"detail": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"detail": f"Failed to search: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@swagger_auto_schema(
    method="post",
    operation_description="Query documents by IDs and return selected fields.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            "collection_name": _collection_name_prop,
            "ids": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Items(type=openapi.TYPE_STRING),
                description="List of IDs to fetch",
            ),
            "output_fields": _array_of_strings,
        },
        required=["collection_name", "ids", "output_fields"],
    ),
    responses={
        200: openapi.Response(
            description="Query succeeded",
            examples={
                "application/json": {
                    "ok": True,
                    "result": [
                        {"id": "a1", "text": "hello"},
                        {"id": "a2", "text": "world"},
                    ],
                }
            },
        ),
        400: "Bad Request",
        500: "Server Error",
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
def vectordb_query(request):
    db = _ensure_db()
    if isinstance(db, Response):
        return db

    err = _require_fields(request.data, ["collection_name", "ids", "output_fields"])
    if err:
        return err

    collection_name = request.data["collection_name"]
    ids = request.data["ids"]
    output_fields = request.data["output_fields"]

    if not isinstance(ids, list) or not all(isinstance(x, (str, int)) for x in ids):
        return Response({"detail": "ids must be a list of strings/ints."}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(output_fields, list) or not all(isinstance(x, str) for x in output_fields):
        return Response({"detail": "output_fields must be a list of strings."}, status=status.HTTP_400_BAD_REQUEST)

    ids = [str(x) for x in ids]

    try:
        res = db.query(collection_name=collection_name, ids=ids, output_fields=output_fields)
        return Response({"ok": True, "result": res}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"detail": f"Failed to query: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
