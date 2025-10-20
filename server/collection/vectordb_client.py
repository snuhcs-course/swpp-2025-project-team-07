"""
HTTP client helper for VectorDB API calls with parallel request support.
"""
from typing import Dict, List, Optional, Tuple, Any
from concurrent.futures import ThreadPoolExecutor, Future
import requests
from django.conf import settings


class VectorDBClient:
    """Client for making parallel requests to chat and screen vector databases."""

    def __init__(self):
        self.chat_url = settings.VECTORDB_CHAT_HOST
        self.screen_url = settings.VECTORDB_SCREEN_HOST
        self.timeout = 30  # seconds

    def _get_collection_name(self, user_id: int, db_type: str) -> str:
        """Generate collection name for a user and database type."""
        return f"{db_type}_{user_id}"

    def _make_request(
        self,
        base_url: str,
        endpoint: str,
        payload: Dict[str, Any],
    ) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """
        Make a single HTTP POST request to vectordb.

        Returns:
            (success, response_data, error_message)
        """
        url = f"{base_url}/api/vectordb/{endpoint}/"
        try:
            response = requests.post(url, json=payload, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()

            if not data.get('ok', False):
                return False, None, f"VectorDB returned ok=False: {data}"
            return True, data, None
        except requests.exceptions.Timeout:
            return False, None, f"Request to {url} timed out"
        except requests.exceptions.RequestException as e:
            return False, None, f"Request to {url} failed: {str(e)}"
        except ValueError as e:
            return False, None, f"Invalid JSON response from {url}: {str(e)}"

    def insert_parallel(
        self,
        user_id: int,
        chat_data: Optional[List[Dict]] = None,
        screen_data: Optional[List[Dict]] = None,
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        Insert data into chat and/or screen vectordb in parallel.

        Args:
            user_id: User ID for collection naming
            chat_data: List of chat data objects to insert
            screen_data: List of screen data objects to insert

        Returns:
            (success, results_dict, error_message)
        """
        results = {
            'chat_insert_count': 0,
            'screen_insert_count': 0,
        }

        futures: Dict[str, Future] = {}

        with ThreadPoolExecutor(max_workers=2) as executor:
            if chat_data:
                chat_collection = self._get_collection_name(user_id, 'chat')
                chat_payload = {
                    'collection_name': chat_collection,
                    'data': chat_data,
                }
                futures['chat'] = executor.submit(
                    self._make_request,
                    self.chat_url,
                    'insert',
                    chat_payload,
                )

            if screen_data:
                screen_collection = self._get_collection_name(user_id, 'screen')
                screen_payload = {
                    'collection_name': screen_collection,
                    'data': screen_data,
                }
                futures['screen'] = executor.submit(
                    self._make_request,
                    self.screen_url,
                    'insert',
                    screen_payload,
                )

        # Collect results
        for db_type, future in futures.items():
            success, data, error = future.result()
            if not success:
                return False, {}, f"{db_type} vectordb insert failed: {error}"

            insert_count = data.get('result', {}).get('insert_count', 0)
            results[f'{db_type}_insert_count'] = insert_count

        return True, results, None

    def search_parallel(
        self,
        user_id: int,
        chat_data: Optional[List[Dict]] = None,
        screen_data: Optional[List[Dict]] = None,
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        Search chat and/or screen vectordb in parallel.

        Args:
            user_id: User ID for collection naming
            chat_data: List of chat query vectors
            screen_data: List of screen query vectors

        Returns:
            (success, results_dict, error_message)
        """
        results = {
            'chat_scores': None,
            'screen_scores': None,
        }

        futures: Dict[str, Future] = {}

        with ThreadPoolExecutor(max_workers=2) as executor:
            if chat_data:
                chat_collection = self._get_collection_name(user_id, 'chat')
                chat_payload = {
                    'collection_name': chat_collection,
                    'data': chat_data,
                }
                futures['chat'] = executor.submit(
                    self._make_request,
                    self.chat_url,
                    'search',
                    chat_payload,
                )

            if screen_data:
                screen_collection = self._get_collection_name(user_id, 'screen')
                screen_payload = {
                    'collection_name': screen_collection,
                    'data': screen_data,
                }
                futures['screen'] = executor.submit(
                    self._make_request,
                    self.screen_url,
                    'search',
                    screen_payload,
                )

        # Collect results
        for db_type, future in futures.items():
            success, data, error = future.result()
            if not success:
                return False, {}, f"{db_type} vectordb search failed: {error}"

            scores = data.get('scores', [])
            results[f'{db_type}_scores'] = scores

        return True, results, None

    def query_parallel(
        self,
        user_id: int,
        chat_ids: Optional[List[str]] = None,
        chat_output_fields: Optional[List[str]] = None,
        screen_ids: Optional[List[str]] = None,
        screen_output_fields: Optional[List[str]] = None,
    ) -> Tuple[bool, Dict[str, Any], Optional[str]]:
        """
        Query documents by ID from chat and/or screen vectordb in parallel.

        Args:
            user_id: User ID for collection naming
            chat_ids: List of chat document IDs
            chat_output_fields: Fields to return for chat documents
            screen_ids: List of screen document IDs
            screen_output_fields: Fields to return for screen documents

        Returns:
            (success, results_dict, error_message)
        """
        results = {
            'chat_results': [],
            'screen_results': [],
        }

        futures: Dict[str, Future] = {}

        with ThreadPoolExecutor(max_workers=2) as executor:
            if chat_ids and chat_output_fields:
                chat_collection = self._get_collection_name(user_id, 'chat')
                chat_payload = {
                    'collection_name': chat_collection,
                    'ids': chat_ids,
                    'output_fields': chat_output_fields,
                }
                futures['chat'] = executor.submit(
                    self._make_request,
                    self.chat_url,
                    'query',
                    chat_payload,
                )

            if screen_ids and screen_output_fields:
                screen_collection = self._get_collection_name(user_id, 'screen')
                screen_payload = {
                    'collection_name': screen_collection,
                    'ids': screen_ids,
                    'output_fields': screen_output_fields,
                }
                futures['screen'] = executor.submit(
                    self._make_request,
                    self.screen_url,
                    'query',
                    screen_payload,
                )

        # Collect results
        for db_type, future in futures.items():
            success, data, error = future.result()
            if not success:
                return False, {}, f"{db_type} vectordb query failed: {error}"

            documents = data.get('result', [])
            results[f'{db_type}_results'] = documents

        return True, results, None


# Singleton instance
vectordb_client = VectorDBClient()
