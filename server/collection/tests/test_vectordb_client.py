"""
Unit tests for VectorDB client with mocked HTTP requests.
"""

import pytest
import responses
from collection.vectordb_client import VectorDBClient


@pytest.fixture
def vectordb_client():
    """Provides a VectorDB client instance for testing."""
    return VectorDBClient()


class TestVectorDBClientHelpers:
    """Tests for VectorDBClient helper methods."""

    def test_get_collection_name(self, vectordb_client):
        """Test collection name generation."""
        assert vectordb_client._get_collection_name(123, "chat") == "chat_123"
        assert vectordb_client._get_collection_name(456, "screen") == "screen_456"


@pytest.mark.django_db
class TestVectorDBClientCreateCollections:
    """Tests for creating VectorDB collections."""

    @responses.activate
    def test_create_collections_parallel_success(self, vectordb_client):
        """Test successful parallel collection creation."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )

        success, error = vectordb_client.create_collections_parallel(user_id=123)

        assert success is True
        assert error is None
        assert len(responses.calls) == 2

    @responses.activate
    def test_create_collections_parallel_failure(self, vectordb_client):
        """Test collection creation failure."""
        # Mock chat VectorDB failure
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
            json={"ok": False, "error": "Collection already exists"},
            status=400,
        )

        success, error = vectordb_client.create_collections_parallel(user_id=123)

        assert success is False
        assert "chat collection creation failed" in error


@pytest.mark.django_db
class TestVectorDBClientInsert:
    """Tests for inserting data into VectorDB."""

    @responses.activate
    def test_insert_parallel_chat_only(self, vectordb_client):
        """Test inserting data into chat VectorDB only."""
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 5}},
            status=200,
        )

        chat_data = [
            {"id": "1", "vector": [0.1] * 768, "text": "test1"},
            {"id": "2", "vector": [0.2] * 768, "text": "test2"},
        ]

        success, results, error = vectordb_client.insert_parallel(user_id=123, chat_data=chat_data)

        assert success is True
        assert error is None
        assert results["chat_insert_count"] == 5
        assert results["screen_insert_count"] == 0
        assert len(responses.calls) == 1

    @responses.activate
    def test_insert_parallel_both_databases(self, vectordb_client):
        """Test inserting data into both chat and screen VectorDBs."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 3}},
            status=200,
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 2}},
            status=200,
        )

        chat_data = [{"id": "1", "vector": [0.1] * 768}]
        screen_data = [{"id": "2", "vector": [0.2] * 512}]

        success, results, error = vectordb_client.insert_parallel(
            user_id=123, chat_data=chat_data, screen_data=screen_data
        )

        assert success is True
        assert error is None
        assert results["chat_insert_count"] == 3
        assert results["screen_insert_count"] == 2
        assert len(responses.calls) == 2

    @responses.activate
    def test_insert_parallel_with_failure(self, vectordb_client):
        """Test insert operation with failure."""
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/",
            json={"ok": False, "error": "Insert failed"},
            status=500,
        )

        chat_data = [{"id": "1", "vector": [0.1] * 768}]

        success, results, error = vectordb_client.insert_parallel(user_id=123, chat_data=chat_data)

        assert success is False
        assert "chat vectordb insert failed" in error


@pytest.mark.django_db
class TestVectorDBClientSearch:
    """Tests for searching VectorDB."""

    @responses.activate
    def test_search_parallel_success(self, vectordb_client):
        """Test successful parallel search."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/search/",
            json={"ok": True, "scores": [[0.9, 0.8, 0.7]], "ids": [["1", "2", "3"]]},
            status=200,
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/search/",
            json={"ok": True, "scores": [[0.95, 0.85]], "ids": [["s1", "s2"]]},
            status=200,
        )

        chat_data = [{"query_vector": [0.1] * 768, "top_k": 3}]
        screen_data = [{"query_vector": [0.2] * 512, "top_k": 2}]

        success, results, error = vectordb_client.search_parallel(
            user_id=123, chat_data=chat_data, screen_data=screen_data
        )

        assert success is True
        assert error is None
        assert results["chat_scores"] == [[0.9, 0.8, 0.7]]
        assert results["chat_ids"] == [["1", "2", "3"]]
        assert results["screen_scores"] == [[0.95, 0.85]]
        assert results["screen_ids"] == [["s1", "s2"]]

    @responses.activate
    def test_search_parallel_with_timeout(self, vectordb_client):
        """Test search operation with timeout."""
        import requests

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/search/",
            body=requests.exceptions.Timeout(),
        )

        chat_data = [{"query_vector": [0.1] * 768, "top_k": 3}]

        success, results, error = vectordb_client.search_parallel(user_id=123, chat_data=chat_data)

        assert success is False
        assert "timed out" in error


@pytest.mark.django_db
class TestVectorDBClientQuery:
    """Tests for querying documents from VectorDB."""

    @responses.activate
    def test_query_parallel_success(self, vectordb_client):
        """Test successful parallel query."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/query/",
            json={
                "ok": True,
                "result": [{"id": "1", "text": "Document 1"}, {"id": "2", "text": "Document 2"}],
            },
            status=200,
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={"ok": True, "result": [{"id": "s1", "url": "screen1.png"}]},
            status=200,
        )

        success, results, error = vectordb_client.query_parallel(
            user_id=123,
            chat_ids=["1", "2"],
            chat_output_fields=["id", "text"],
            screen_ids=["s1"],
            screen_output_fields=["id", "url"],
        )

        assert success is True
        assert error is None
        assert len(results["chat_results"]) == 2
        assert results["chat_results"][0]["id"] == "1"
        assert len(results["screen_results"]) == 1
        assert results["screen_results"][0]["id"] == "s1"

    @responses.activate
    def test_query_parallel_with_invalid_json(self, vectordb_client):
        """Test query operation with invalid JSON response."""
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/query/",
            body="invalid json",
            status=200,
        )

        success, results, error = vectordb_client.query_parallel(
            user_id=123, chat_ids=["1"], chat_output_fields=["id"]
        )

        assert success is False
        assert "failed" in error.lower() or "json" in error.lower()
