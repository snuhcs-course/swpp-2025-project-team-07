from abc import (
    ABC,
    abstractmethod,
)
from typing import (
    Dict,
    List,
)


class BaseVectorDB(ABC):
    @abstractmethod
    def __init__(self, uri: str) -> None:
        raise NotImplementedError()

    @abstractmethod
    def get_uri(self) -> str:
        raise NotImplementedError()

    @abstractmethod
    def create_collection(self, collection_name: str, dimension: int, metric_type: str, id_type: str) -> None:
        raise NotImplementedError()

    @abstractmethod
    def drop_collection(self, collection_name: str) -> None:
        raise NotImplementedError()

    @abstractmethod
    def insert(self, collection_name: str, data: List[Dict]) -> Dict:
        raise NotImplementedError()

    @abstractmethod
    def delete(self, collection_name: str, ids: List[str]) -> Dict:
        raise NotImplementedError()

    @abstractmethod
    def search(self, collection_name: str, data: List[Dict], limit: int, output_fields: List[str]) -> List[List[Dict]]:
        raise NotImplementedError()

    @abstractmethod
    def query(self, collection_name: str, ids: List[str], output_fields: List[str]) -> List[Dict]:
        raise NotImplementedError()
