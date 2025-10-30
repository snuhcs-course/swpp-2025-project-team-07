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
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/',
            json={'ok': True, 'result': {'insert_count': 2}},
            status=200
        )

        url = reverse('store_keys')
        data = {
            'chat_data': [
                {'id': '1', 'vector': [0.1] * 768, 'text': 'test1'},
                {'id': '2', 'vector': [0.2] * 768, 'text': 'test2'},
            ]
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['ok'] is True
        assert response.data['result']['chat_insert_count'] == 2

    @responses.activate
    def test_insert_both_chat_and_screen_data(self, jwt_authenticated_client, user):
        """Test inserting both chat and screen data."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/',
            json={'ok': True, 'result': {'insert_count': 1}},
            status=200
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/insert/',
            json={'ok': True, 'result': {'insert_count': 1}},
            status=200
        )

        url = reverse('store_keys')
        data = {
            'chat_data': [{'id': '1', 'vector': [0.1] * 768}],
            'screen_data': [{'id': 's1', 'vector': [0.2] * 512}]
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['ok'] is True
        assert response.data['result']['chat_insert_count'] == 1
        assert response.data['result']['screen_insert_count'] == 1

    def test_insert_without_authentication(self, api_client):
        """Test that unauthenticated users cannot insert data."""
        url = reverse('store_keys')
        data = {'chat_data': [{'id': '1', 'vector': [0.1] * 768}]}
        response = api_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_insert_with_empty_data(self, jwt_authenticated_client):
        """Test that inserting with empty data returns 400."""
        url = reverse('store_keys')
        data = {}
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'both chat_data and screen_data cannot be empty' in response.data['detail'].lower()

    @responses.activate
    def test_insert_with_vectordb_failure(self, jwt_authenticated_client):
        """Test handling of VectorDB failure."""
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/insert/',
            json={'ok': False, 'error': 'Database error'},
            status=500
        )

        url = reverse('store_keys')
        data = {'chat_data': [{'id': '1', 'vector': [0.1] * 768}]}
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


@pytest.mark.django_db
class TestSearchCollections:
    """Tests for the search_collections endpoint."""

    @responses.activate
    def test_search_chat_data_only(self, jwt_authenticated_client):
        """Test searching chat data only."""
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/search/',
            json={
                'ok': True,
                'scores': [[0.9, 0.8, 0.7]],
                'ids': [['1', '2', '3']]
            },
            status=200
        )

        url = reverse('search_collections')
        data = {
            'chat_data': [{'query_vector': [0.1] * 768, 'top_k': 3}]
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['ok'] is True
        assert response.data['chat_scores'] == [[0.9, 0.8, 0.7]]
        assert response.data['chat_ids'] == [['1', '2', '3']]
        assert response.data['screen_scores'] is None

    @responses.activate
    def test_search_both_collections(self, jwt_authenticated_client):
        """Test searching both chat and screen collections."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/search/',
            json={
                'ok': True,
                'scores': [[0.9, 0.8]],
                'ids': [['c1', 'c2']]
            },
            status=200
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/search/',
            json={
                'ok': True,
                'scores': [[0.95, 0.85]],
                'ids': [['s1', 's2']]
            },
            status=200
        )

        url = reverse('search_collections')
        data = {
            'chat_data': [{'query_vector': [0.1] * 768, 'top_k': 2}],
            'screen_data': [{'query_vector': [0.2] * 512, 'top_k': 2}]
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['ok'] is True
        assert response.data['chat_scores'] == [[0.9, 0.8]]
        assert response.data['screen_scores'] == [[0.95, 0.85]]

    def test_search_without_authentication(self, api_client):
        """Test that unauthenticated users cannot search."""
        url = reverse('search_collections')
        data = {'chat_data': [{'query_vector': [0.1] * 768}]}
        response = api_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_search_with_empty_data(self, jwt_authenticated_client):
        """Test that searching with empty data returns 400."""
        url = reverse('search_collections')
        data = {}
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestQueryCollection:
    """Tests for the query_collection endpoint."""

    @responses.activate
    def test_query_chat_documents(self, jwt_authenticated_client):
        """Test querying chat documents by ID."""
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/query/',
            json={
                'ok': True,
                'result': [
                    {'id': '1', 'text': 'Document 1'},
                    {'id': '2', 'text': 'Document 2'}
                ]
            },
            status=200
        )

        url = reverse('query_collection')
        data = {
            'chat_ids': ['1', '2'],
            'chat_output_fields': ['id', 'text']
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['ok'] is True
        assert len(response.data['chat_results']) == 2
        assert response.data['chat_results'][0]['id'] == '1'

    @responses.activate
    def test_query_both_collections(self, jwt_authenticated_client):
        """Test querying both chat and screen collections."""
        # Mock chat VectorDB
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8000/api/vectordb/query/',
            json={
                'ok': True,
                'result': [{'id': 'c1', 'text': 'Chat doc'}]
            },
            status=200
        )
        # Mock screen VectorDB
        responses.add(
            responses.POST,
            'http://ec2-3-38-207-251.ap-northeast-2.compute.amazonaws.com:8001/api/vectordb/query/',
            json={
                'ok': True,
                'result': [{'id': 's1', 'url': 'screen.png'}]
            },
            status=200
        )

        url = reverse('query_collection')
        data = {
            'chat_ids': ['c1'],
            'chat_output_fields': ['id', 'text'],
            'screen_ids': ['s1'],
            'screen_output_fields': ['id', 'url']
        }
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['ok'] is True
        assert len(response.data['chat_results']) == 1
        assert len(response.data['screen_results']) == 1

    def test_query_without_authentication(self, api_client):
        """Test that unauthenticated users cannot query."""
        url = reverse('query_collection')
        data = {
            'chat_ids': ['1'],
            'chat_output_fields': ['id']
        }
        response = api_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_query_with_missing_parameters(self, jwt_authenticated_client):
        """Test that querying without proper parameters returns 400."""
        url = reverse('query_collection')
        # Missing output_fields
        data = {'chat_ids': ['1']}
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_query_with_empty_data(self, jwt_authenticated_client):
        """Test that querying with no data returns 400."""
        url = reverse('query_collection')
        data = {}
        response = jwt_authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
