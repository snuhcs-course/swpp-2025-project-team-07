from typing import (
    Dict,
    List,
)

from pymilvus import MilvusClient

from .base_vectordb import BaseVectorDB


class MilvusVectorDB(BaseVectorDB):
    def __init__(self, uri: str) -> None:
        self.client = MilvusClient(uri=uri)
        self.uri = uri

    def get_uri(self) -> str:
        return self.uri

    def create_collection(self, collection_name: str, dimension: int, metric_type: str, id_type: str) -> None:
        assert dimension > 0, "Dimension must be greater than 0!"
        assert metric_type in ["L2", "IP", "COSINE"], "Invalid metric type!"
        assert id_type in ["int", "string"], "Invalid id type!"

        self.client.create_collection(
            collection_name=collection_name,
            dimension=dimension,
            metric_type=metric_type,
            id_type=id_type,
            max_length=1024,  # TODO (minchan): check this value
        )

    def drop_collection(self, collection_name: str) -> None:
        self.client.drop_collection(collection_name=collection_name)

    def insert(self, collection_name: str, data: List[Dict]) -> Dict:
        res = self.client.insert(collection_name=collection_name, data=data)
        parsed_res = {
            "insert_count": int(res["insert_count"]),
            "ids": [str(i) for i in res["ids"]],
        }
        return parsed_res

    def delete(self, collection_name: str, ids: List[str]) -> Dict:
        res = self.client.delete(collection_name=collection_name, ids=ids)
        return res

    def search(self, collection_name: str, data: List[Dict], limit: int, output_fields: List[str]) -> List[List[Dict]]:
        res = self.client.search(collection_name=collection_name, data=data, limit=limit, output_fields=output_fields)
        return res
    
    def query(self, collection_name: str, ids: List[str], output_fields: List[str]) -> List[Dict]:
        res = self.client.query(collection_name=collection_name, ids=ids, output_fields=output_fields)
        return res
