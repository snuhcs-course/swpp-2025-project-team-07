"""
Integration tests for collection views/API endpoints.
"""

import pytest
import responses
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestInsertToCollection:
    """Tests for the insert_to_collection endpoint."""

    @responses.activate
    def test_insert_chat_data_only(self, jwt_authenticated_client, user):
        """Test inserting chat data only."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 2}},
            status=200,
        )

        url = reverse("store_keys")
        data = {
            "chat_data": [
                {"id": "1", "vector": [0.1] * 768, "text": "test1"},
                {"id": "2", "vector": [0.2] * 768, "text": "test2"},
            ]
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["ok"] is True
        assert response.data["result"]["chat_insert_count"] == 2

    @responses.activate
    def test_insert_both_chat_and_screen_data(self, jwt_authenticated_client, user):
        """Test inserting both chat and screen data."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 1}},
            status=200,
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 1}},
            status=200,
        )

        url = reverse("store_keys")
        data = {
            "chat_data": [{"id": "1", "vector": [0.1] * 768}],
            "screen_data": [{"id": "s1", "vector": [0.2] * 512}],
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["ok"] is True
        assert response.data["result"]["chat_insert_count"] == 1
        assert response.data["result"]["screen_insert_count"] == 1

    def test_insert_without_authentication(self, api_client):
        """Test that unauthenticated users cannot insert data."""
        url = reverse("store_keys")
        data = {"chat_data": [{"id": "1", "vector": [0.1] * 768}]}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_insert_with_empty_data(self, jwt_authenticated_client):
        """Test that inserting with empty data returns 400."""
        url = reverse("store_keys")
        data = {}
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "both chat_data and screen_data cannot be empty" in response.data["detail"].lower()

    @responses.activate
    def test_insert_with_vectordb_failure(self, jwt_authenticated_client):
        """Test handling of VectorDB failure."""
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/",
            json={"ok": False, "error": "Database error"},
            status=500,
        )

        url = reverse("store_keys")
        data = {"chat_data": [{"id": "1", "vector": [0.1] * 768}]}
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


@pytest.mark.django_db
class TestSearchCollections:
    """Tests for the search_collections endpoint."""

    @responses.activate
    def test_search_chat_data_only(self, jwt_authenticated_client):
        """Test searching chat data only."""
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/search/",
            json={"ok": True, "scores": [[0.9, 0.8, 0.7]], "ids": [["1", "2", "3"]]},
            status=200,
        )

        url = reverse("search_collections")
        data = {"chat_data": [{"query_vector": [0.1] * 768, "top_k": 3}]}
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        assert response.data["chat_scores"] == [[0.9, 0.8, 0.7]]
        assert response.data["chat_ids"] == [["1", "2", "3"]]
        assert response.data["screen_scores"] is None

    @responses.activate
    def test_search_both_collections(self, jwt_authenticated_client):
        """Test searching both chat and screen collections."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/search/",
            json={"ok": True, "scores": [[0.9, 0.8]], "ids": [["c1", "c2"]]},
            status=200,
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/search/",
            json={"ok": True, "scores": [[0.95, 0.85]], "ids": [["s1", "s2"]]},
            status=200,
        )

        url = reverse("search_collections")
        data = {
            "chat_data": [{"query_vector": [0.1] * 768, "top_k": 2}],
            "screen_data": [{"query_vector": [0.2] * 512, "top_k": 2}],
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        assert response.data["chat_scores"] == [[0.9, 0.8]]
        assert response.data["screen_scores"] == [[0.95, 0.85]]

    def test_search_without_authentication(self, api_client):
        """Test that unauthenticated users cannot search."""
        url = reverse("search_collections")
        data = {"chat_data": [{"query_vector": [0.1] * 768}]}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_search_with_empty_data(self, jwt_authenticated_client):
        """Test that searching with empty data returns 400."""
        url = reverse("search_collections")
        data = {}
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestQueryCollection:
    """Tests for the query_collection endpoint."""

    @responses.activate
    def test_query_chat_documents(self, jwt_authenticated_client):
        """Test querying chat documents by ID."""
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/query/",
            json={
                "ok": True,
                "result": [{"id": "1", "text": "Document 1"}, {"id": "2", "text": "Document 2"}],
            },
            status=200,
        )

        url = reverse("query_collection")
        data = {"chat_ids": ["1", "2"], "chat_output_fields": ["id", "text"]}
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        assert len(response.data["chat_results"]) == 2
        assert response.data["chat_results"][0]["id"] == "1"

    @responses.activate
    def test_query_both_collections(self, jwt_authenticated_client):
        """Test querying both chat and screen collections."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/query/",
            json={"ok": True, "result": [{"id": "c1", "text": "Chat doc"}]},
            status=200,
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={"ok": True, "result": [{"id": "s1", "url": "screen.png"}]},
            status=200,
        )

        url = reverse("query_collection")
        data = {
            "chat_ids": ["c1"],
            "chat_output_fields": ["id", "text"],
            "screen_ids": ["s1"],
            "screen_output_fields": ["id", "url"],
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        assert len(response.data["chat_results"]) == 1
        assert len(response.data["screen_results"]) == 1

    def test_query_without_authentication(self, api_client):
        """Test that unauthenticated users cannot query."""
        url = reverse("query_collection")
        data = {"chat_ids": ["1"], "chat_output_fields": ["id"]}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_query_with_missing_parameters(self, jwt_authenticated_client):
        """Test that querying without proper parameters returns 400."""
        url = reverse("query_collection")
        # Missing output_fields
        data = {"chat_ids": ["1"]}
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_query_with_empty_data(self, jwt_authenticated_client):
        """Test that querying with no data returns 400."""
        url = reverse("query_collection")
        data = {}
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestClearCollections:
    """Tests for the clear_collections endpoint."""

    @responses.activate
    def test_clear_both_collections_success(self, api_client):
        """Test successfully clearing both chat and screen collections."""
        # Mock drop operations
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        # Mock create operations
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )

        url = reverse("clear_collections")
        data = {"user_id": 123, "clear_chat": True, "clear_screen": True}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        assert "cleared and recreated successfully" in response.data["message"].lower()
        # Verify all 4 operations were called (2 drops + 2 creates)
        assert len(responses.calls) == 4

    @responses.activate
    def test_clear_chat_collection_only(self, api_client):
        """Test clearing only the chat collection."""
        # Mock drop operation
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        # Mock create operation
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )

        url = reverse("clear_collections")
        data = {"user_id": 456, "clear_chat": True, "clear_screen": False}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        # Verify only 2 operations were called (1 drop + 1 create)
        assert len(responses.calls) == 2

    @responses.activate
    def test_clear_screen_collection_only(self, api_client):
        """Test clearing only the screen collection."""
        # Mock drop operation
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        # Mock create operation
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )

        url = reverse("clear_collections")
        data = {"user_id": 789, "clear_chat": False, "clear_screen": True}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        # Verify only 2 operations were called (1 drop + 1 create)
        assert len(responses.calls) == 2

    @responses.activate
    def test_clear_with_collection_version(self, api_client):
        """Test clearing collections with collection_version parameter."""
        # Mock drop operations
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        # Mock create operations
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )

        url = reverse("clear_collections")
        data = {
            "user_id": 123,
            "clear_chat": False,
            "clear_screen": True,
            "collection_version": "v3",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True
        # Verify collection names include version
        assert "screen_123_v3" in responses.calls[0].request.body.decode()
        assert "screen_123_v3" in responses.calls[1].request.body.decode()

    def test_clear_with_both_false(self, api_client):
        """Test validation error when both clear_chat and clear_screen are false."""
        url = reverse("clear_collections")
        data = {"user_id": 123, "clear_chat": False, "clear_screen": False}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "at least one" in response.data["detail"].lower()

    def test_clear_no_authentication_required(self, api_client):
        """Test that clear_collections doesn't require authentication (AllowAny)."""
        # Mock drop and create operations
        with responses.RequestsMock() as rsps:
            rsps.add(
                responses.POST,
                "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/drop_collection/",
                json={"ok": True, "result": {"status": "dropped"}},
                status=200,
            )
            rsps.add(
                responses.POST,
                "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
                json={"ok": True, "result": {"status": "created"}},
                status=200,
            )

            url = reverse("clear_collections")
            data = {"user_id": 999, "clear_chat": True, "clear_screen": False}
            response = api_client.post(url, data, format="json")

            # Should succeed without authentication
            assert response.status_code == status.HTTP_200_OK

    @responses.activate
    def test_clear_drop_failure(self, api_client):
        """Test failure when drop operation fails."""
        # Mock drop operation failure
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/drop_collection/",
            json={"ok": False, "error": "Collection not found"},
            status=404,
        )

        url = reverse("clear_collections")
        data = {"user_id": 123, "clear_chat": True, "clear_screen": False}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "failed to drop collections" in response.data["detail"].lower()
        # Create should not be called if drop fails
        assert len(responses.calls) == 1

    @responses.activate
    def test_clear_create_failure(self, api_client):
        """Test failure when create operation fails after successful drop."""
        # Mock successful drop
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        # Mock failed create
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
            json={"ok": False, "error": "Insufficient permissions"},
            status=403,
        )

        url = reverse("clear_collections")
        data = {"user_id": 123, "clear_chat": True, "clear_screen": False}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "failed to re-create collections" in response.data["detail"].lower()
        # Both drop and create should be called
        assert len(responses.calls) == 2

    @responses.activate
    def test_clear_partial_drop_failure(self, api_client):
        """Test when one collection drops successfully but the other fails."""
        # Mock chat drop success
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        # Mock screen drop failure
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/drop_collection/",
            json={"ok": False, "error": "Database error"},
            status=500,
        )

        url = reverse("clear_collections")
        data = {"user_id": 123, "clear_chat": True, "clear_screen": True}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "failed to drop collections" in response.data["detail"].lower()
        # Should have attempted both drops
        assert len(responses.calls) == 2

    def test_clear_missing_user_id(self, api_client):
        """Test clear_collections handles missing user_id gracefully."""
        # Mock operations - will be called with None user_id
        with responses.RequestsMock() as rsps:
            rsps.add(
                responses.POST,
                "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/drop_collection/",
                json={"ok": True, "result": {"status": "dropped"}},
                status=200,
            )
            rsps.add(
                responses.POST,
                "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/create_collection/",
                json={"ok": True, "result": {"status": "created"}},
                status=200,
            )

            url = reverse("clear_collections")
            # Missing user_id
            data = {"clear_chat": True, "clear_screen": False}
            response = api_client.post(url, data, format="json")

            # Should succeed - API doesn't validate user_id presence
            # (validation would be in the VectorDB client)
            assert response.status_code == status.HTTP_200_OK

    @responses.activate
    def test_clear_screen_deletes_video_metadata(self, api_client, user):
        """Test that clearing screen collection also deletes VideoSetMetadata entries."""
        from collection.models import VideoSetMetadata

        # Create some VideoSetMetadata entries
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-1",
            user=user,
            timestamp=1000,
            collection_version=None,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_101",
            video_set_id="set-1",
            user=user,
            timestamp=2000,
            collection_version=None,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_200",
            video_set_id="set-2",
            user=user,
            timestamp=3000,
            collection_version="v2",
        )

        # Verify metadata exists
        assert VideoSetMetadata.objects.filter(user=user).count() == 3

        # Mock drop and create operations
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )

        # Clear screen collection without collection_version
        url = reverse("clear_collections")
        data = {"user_id": user.id, "clear_chat": False, "clear_screen": True}
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Verify all VideoSetMetadata entries for this user are deleted
        assert VideoSetMetadata.objects.filter(user=user).count() == 0

    @responses.activate
    def test_clear_screen_deletes_only_matching_version(self, api_client, user):
        """Test that clearing with collection_version only deletes matching metadata."""
        from collection.models import VideoSetMetadata

        # Create metadata with different collection_versions
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-1",
            user=user,
            timestamp=1000,
            collection_version="v1",
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_200",
            video_set_id="set-2",
            user=user,
            timestamp=2000,
            collection_version="v2",
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_300",
            video_set_id="set-3",
            user=user,
            timestamp=3000,
            collection_version=None,
        )

        # Verify 3 entries exist
        assert VideoSetMetadata.objects.filter(user=user).count() == 3

        # Mock drop and create operations
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/drop_collection/",
            json={"ok": True, "result": {"status": "dropped"}},
            status=200,
        )
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/create_collection/",
            json={"ok": True, "result": {"status": "created"}},
            status=200,
        )

        # Clear screen collection with collection_version="v2"
        url = reverse("clear_collections")
        data = {
            "user_id": user.id,
            "clear_chat": False,
            "clear_screen": True,
            "collection_version": "v2",
        }
        response = api_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Verify only v2 metadata was deleted
        assert VideoSetMetadata.objects.filter(user=user).count() == 2
        assert VideoSetMetadata.objects.filter(user=user, collection_version="v1").exists()
        assert VideoSetMetadata.objects.filter(user=user, collection_version=None).exists()
        assert not VideoSetMetadata.objects.filter(user=user, collection_version="v2").exists()


@pytest.mark.django_db
class TestVideoSetMetadata:
    """Tests for video set metadata functionality."""

    @responses.activate
    def test_insert_with_video_set_id_stores_metadata(self, jwt_authenticated_client, user):
        """Test that inserting screen data with video_set_id stores metadata."""
        from collection.models import VideoSetMetadata

        # Mock screen VectorDB
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 3}},
            status=200,
        )

        url = reverse("store_keys")
        data = {
            "screen_data": [
                {
                    "id": "screen_100",
                    "vector": [0.1] * 512,
                    "timestamp": 1000,
                    "video_set_id": "set-abc-123",
                },
                {
                    "id": "screen_101",
                    "vector": [0.2] * 512,
                    "timestamp": 2000,
                    "video_set_id": "set-abc-123",
                },
                {
                    "id": "screen_102",
                    "vector": [0.3] * 512,
                    "timestamp": 3000,
                    "video_set_id": "set-abc-123",
                },
            ]
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        # Verify metadata was stored
        metadata = VideoSetMetadata.objects.filter(user=user)
        assert metadata.count() == 3
        assert metadata.filter(video_set_id="set-abc-123").count() == 3

        # Verify timestamps are stored correctly (with user_id prefix)
        video_100 = VideoSetMetadata.objects.get(video_id=f"user_{user.id}_screen_100")
        assert video_100.timestamp == 1000
        assert video_100.video_set_id == "set-abc-123"

    @responses.activate
    def test_insert_without_video_set_id_no_metadata(self, jwt_authenticated_client, user):
        """Test that inserting without video_set_id doesn't create metadata (backward compatible)."""
        from collection.models import VideoSetMetadata

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 1}},
            status=200,
        )

        url = reverse("store_keys")
        data = {
            "screen_data": [
                {"id": "screen_200", "vector": [0.1] * 512, "timestamp": 1000}
                # No video_set_id
            ]
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        # Verify no metadata was created
        assert VideoSetMetadata.objects.count() == 0

    @responses.activate
    def test_insert_with_collection_version_stores_version(self, jwt_authenticated_client, user):
        """Test that collection_version is stored in metadata."""
        from collection.models import VideoSetMetadata

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/insert/",
            json={"ok": True, "result": {"insert_count": 1}},
            status=200,
        )

        url = reverse("store_keys")
        data = {
            "screen_data": [
                {
                    "id": "screen_300",
                    "vector": [0.1] * 512,
                    "timestamp": 1000,
                    "video_set_id": "set-xyz",
                }
            ],
            "collection_version": "v2",
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_201_CREATED

        metadata = VideoSetMetadata.objects.get(video_id=f"user_{user.id}_screen_300")
        assert metadata.collection_version == "v2"

    @responses.activate
    def test_query_with_query_video_sets_expands_to_full_set(self, jwt_authenticated_client, user):
        """Test that query_video_sets=true returns video sets grouped and sorted by timestamp."""
        from collection.models import VideoSetMetadata

        # Create metadata for a video set (with user_id prefix)
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-abc",
            user=user,
            timestamp=1000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_101",
            video_set_id="set-abc",
            user=user,
            timestamp=2000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_102",
            video_set_id="set-abc",
            user=user,
            timestamp=3000,
        )

        # Mock VectorDB response - should be called with ALL 3 IDs
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={
                "ok": True,
                "result": [
                    {"id": "screen_100", "content": "Video 1"},
                    {"id": "screen_101", "content": "Video 2"},
                    {"id": "screen_102", "content": "Video 3"},
                ],
            },
            status=200,
        )

        url = reverse("query_collection")
        data = {
            "screen_ids": ["screen_101"],  # Query only one video
            "screen_output_fields": ["id", "timestamp", "content"],
            "query_video_sets": True,  # But expand to full set
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["ok"] is True

        # Should return list of video sets
        assert len(response.data["screen_results"]) == 1  # One video set
        video_set = response.data["screen_results"][0]
        assert video_set["video_set_id"] == "set-abc"
        assert video_set["representative_id"] == "screen_101"  # The ID from original request
        assert len(video_set["videos"]) == 3  # All 3 videos in the set

        # Videos should be sorted by timestamp
        assert video_set["videos"][0]["id"] == "screen_100"
        assert video_set["videos"][1]["id"] == "screen_101"
        assert video_set["videos"][2]["id"] == "screen_102"

        # Verify VectorDB was called with all 3 IDs
        vectordb_request = responses.calls[0].request.body.decode()
        assert "screen_100" in vectordb_request
        assert "screen_101" in vectordb_request
        assert "screen_102" in vectordb_request

    @responses.activate
    def test_query_without_query_video_sets_no_expansion(self, jwt_authenticated_client, user):
        """Test that query_video_sets=false doesn't expand video sets."""
        from collection.models import VideoSetMetadata

        # Create metadata (with user_id prefix)
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-abc",
            user=user,
            timestamp=1000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_101",
            video_set_id="set-abc",
            user=user,
            timestamp=2000,
        )

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={
                "ok": True,
                "result": [{"id": "screen_100", "content": "Video 1"}],
            },
            status=200,
        )

        url = reverse("query_collection")
        data = {
            "screen_ids": ["screen_100"],
            "screen_output_fields": ["id", "content"],
            "query_video_sets": False,  # Don't expand
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Should only return the requested video
        assert len(response.data["screen_results"]) == 1

        # Verify VectorDB was called with only requested ID
        vectordb_request = responses.calls[0].request.body.decode()
        assert "screen_100" in vectordb_request
        assert "screen_101" not in vectordb_request

    @responses.activate
    def test_query_expansion_with_multiple_sets(self, jwt_authenticated_client, user):
        """Test that querying videos from multiple sets returns both sets grouped separately."""
        from collection.models import VideoSetMetadata

        # Create two separate video sets (with user_id prefix)
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-A",
            user=user,
            timestamp=1000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_101",
            video_set_id="set-A",
            user=user,
            timestamp=2000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_200",
            video_set_id="set-B",
            user=user,
            timestamp=5000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_201",
            video_set_id="set-B",
            user=user,
            timestamp=6000,
        )

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={
                "ok": True,
                "result": [
                    {"id": "screen_100"},
                    {"id": "screen_101"},
                    {"id": "screen_200"},
                    {"id": "screen_201"},
                ],
            },
            status=200,
        )

        url = reverse("query_collection")
        data = {
            "screen_ids": ["screen_100", "screen_200"],  # One from each set
            "screen_output_fields": ["id", "timestamp"],
            "query_video_sets": True,
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Should return 2 video sets
        assert len(response.data["screen_results"]) == 2

        # First set should be set-A (earliest timestamp)
        set_a = response.data["screen_results"][0]
        assert set_a["video_set_id"] == "set-A"
        assert set_a["representative_id"] == "screen_100"  # The ID from original request
        assert len(set_a["videos"]) == 2
        assert set_a["videos"][0]["id"] == "screen_100"
        assert set_a["videos"][1]["id"] == "screen_101"

        # Second set should be set-B
        set_b = response.data["screen_results"][1]
        assert set_b["video_set_id"] == "set-B"
        assert set_b["representative_id"] == "screen_200"  # The ID from original request
        assert len(set_b["videos"]) == 2
        assert set_b["videos"][0]["id"] == "screen_200"
        assert set_b["videos"][1]["id"] == "screen_201"

    @responses.activate
    def test_query_representative_id_picks_first_from_request(self, jwt_authenticated_client, user):
        """Test that representative_id is the first ID from original request when multiple qualify."""
        from collection.models import VideoSetMetadata

        # Create a video set with 3 videos
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-abc",
            user=user,
            timestamp=1000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_101",
            video_set_id="set-abc",
            user=user,
            timestamp=2000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_102",
            video_set_id="set-abc",
            user=user,
            timestamp=3000,
        )

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={
                "ok": True,
                "result": [
                    {"id": "screen_100"},
                    {"id": "screen_101"},
                    {"id": "screen_102"},
                ],
            },
            status=200,
        )

        url = reverse("query_collection")
        data = {
            # Request multiple videos from the same set, with screen_102 first
            "screen_ids": ["screen_102", "screen_100"],
            "screen_output_fields": ["id", "timestamp"],
            "query_video_sets": True,
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Should return 1 video set
        assert len(response.data["screen_results"]) == 1
        video_set = response.data["screen_results"][0]
        assert video_set["video_set_id"] == "set-abc"
        # Representative should be screen_102 (appears first in request, not screen_100)
        assert video_set["representative_id"] == "screen_102"
        assert len(video_set["videos"]) == 3

    @responses.activate
    def test_query_expansion_user_isolation(
        self, jwt_authenticated_client, user, django_user_model
    ):
        """Test that users can only expand their own video sets."""
        from collection.models import VideoSetMetadata

        # Create another user
        other_user = django_user_model.objects.create_user(
            email="other@test.com", username="other", password="pass123"
        )

        # Create metadata for current user (with user_id prefix)
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-abc",
            user=user,
            timestamp=1000,
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_101",
            video_set_id="set-abc",
            user=user,
            timestamp=2000,
        )

        # Create metadata for other user with SAME video_set_id (with other_user_id prefix)
        VideoSetMetadata.objects.create(
            video_id=f"user_{other_user.id}_screen_200",
            video_set_id="set-abc",  # Same set ID!
            user=other_user,
            timestamp=3000,
        )

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={
                "ok": True,
                "result": [
                    {"id": "screen_100"},
                    {"id": "screen_101"},
                ],
            },
            status=200,
        )

        url = reverse("query_collection")
        data = {
            "screen_ids": ["screen_100"],
            "screen_output_fields": ["id", "timestamp"],
            "query_video_sets": True,
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Should only return current user's videos in one video set (not other_user's screen_200)
        assert len(response.data["screen_results"]) == 1  # One video set
        video_set = response.data["screen_results"][0]
        assert video_set["video_set_id"] == "set-abc"
        assert video_set["representative_id"] == "screen_100"  # The ID from original request
        assert len(video_set["videos"]) == 2

        result_ids = [v["id"] for v in video_set["videos"]]
        assert "screen_100" in result_ids
        assert "screen_101" in result_ids
        assert "screen_200" not in result_ids

    @responses.activate
    def test_query_expansion_with_no_metadata_returns_original(
        self, jwt_authenticated_client, user
    ):
        """Test that querying videos with no metadata returns original list (backward compatible)."""
        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={"ok": True, "result": [{"id": "screen_999", "content": "Video"}]},
            status=200,
        )

        url = reverse("query_collection")
        data = {
            "screen_ids": ["screen_999"],  # No metadata exists
            "screen_output_fields": ["id", "content"],
            "query_video_sets": True,
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Should return only the requested video
        assert len(response.data["screen_results"]) == 1

        # Verify VectorDB was called with original ID only
        vectordb_request = responses.calls[0].request.body.decode()
        assert "screen_999" in vectordb_request

    @responses.activate
    def test_query_expansion_respects_collection_version(self, jwt_authenticated_client, user):
        """Test that expansion respects collection_version filtering."""
        from collection.models import VideoSetMetadata

        # Create metadata with different collection versions (with user_id prefix)
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_100",
            video_set_id="set-abc",
            user=user,
            timestamp=1000,
            collection_version="v1",
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_101",
            video_set_id="set-abc",
            user=user,
            timestamp=2000,
            collection_version="v1",
        )
        VideoSetMetadata.objects.create(
            video_id=f"user_{user.id}_screen_102",
            video_set_id="set-abc",
            user=user,
            timestamp=3000,
            collection_version="v2",  # Different version
        )

        responses.add(
            responses.POST,
            "http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/",
            json={
                "ok": True,
                "result": [
                    {"id": "screen_100"},
                    {"id": "screen_101"},
                ],
            },
            status=200,
        )

        url = reverse("query_collection")
        data = {
            "screen_ids": ["screen_100"],
            "screen_output_fields": ["id", "timestamp"],
            "query_video_sets": True,
            "collection_version": "v1",
        }
        response = jwt_authenticated_client.post(url, data, format="json")

        assert response.status_code == status.HTTP_200_OK

        # Should only return v1 videos in one video set (not screen_102 with v2)
        assert len(response.data["screen_results"]) == 1  # One video set
        video_set = response.data["screen_results"][0]
        assert video_set["video_set_id"] == "set-abc"
        assert video_set["representative_id"] == "screen_100"  # The ID from original request
        assert len(video_set["videos"]) == 2

        result_ids = [v["id"] for v in video_set["videos"]]
        assert "screen_100" in result_ids
        assert "screen_101" in result_ids
        assert "screen_102" not in result_ids
