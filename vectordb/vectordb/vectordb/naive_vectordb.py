import shutil

from pathlib import Path
from typing import (
    Dict,
    List,
)

import numpy as np
import orjson

from .base_vectordb import BaseVectorDB


def id_type_to_np(id_type: str) -> np.dtype:
    if id_type == "string":
        return np.object_
    if id_type == "int":
        return np.int32
    raise ValueError(f"Unknown id_type {id_type}")


class NaiveCollection:
    VECTOR_FIELD_NAME: str = "vector"
    ID_FIELD_NAME: str = "id"

    def __init__(self, collection_dir: str, metadata: Dict, vector_data: Dict, fields_data: Dict) -> None:
        assert metadata["dimension"] > 0, "Dimension must be greater than 0!"
        assert metadata["metric_type"] in ["L2", "IP", "COSINE"], "Invalid metric type!"
        assert metadata["id_type"] in ["int", "string"], "Invalid id type!"

        self.dir = collection_dir
        self.metadata = metadata
        self.vector_data = vector_data
        self.fields_data = fields_data

    @classmethod
    def create(cls, db_root: Path, collection_name: str, dimension: int, metric_type: str, id_type: str) -> None:
        metadata = {
            "dimension": dimension,
            "metric_type": metric_type,
            "id_type": id_type,
        }

        id_type_np = id_type_to_np(id_type)
        vector_data = {
            cls.VECTOR_FIELD_NAME: np.empty((0, dimension)),
            cls.ID_FIELD_NAME: np.empty(0, dtype=id_type_np),
        }
        fields_data = {}

        ret = cls(db_root / collection_name, metadata, vector_data, fields_data)
        ret.write()
        return ret

    @classmethod
    def load(cls, collection_dir: Path) -> "NaiveVectorDB":
        metadata_path = collection_dir / "meta.json"
        with metadata_path.open("rb") as f:
            metadata = orjson.loads(f.read())

        vector_path = collection_dir / "vector.npz"
        vector_data = np.load(vector_path, allow_pickle=True)

        fields_path = collection_dir / "fields.json"
        with fields_path.open("rb") as f:
            fields_data = orjson.loads(f.read())

        return cls(collection_dir, metadata, vector_data, fields_data)

    def write(self) -> None:
        self.dir.mkdir(exist_ok=True)

        metadata_path = self.dir / "meta.json"
        with metadata_path.open("wb") as f:
            f.write(orjson.dumps(self.metadata))

        vector_path = self.dir / "vector.npz"
        with vector_path.open("wb") as f:
            np.savez_compressed(f, **self.vector_data)

        fields_path = self.dir / "fields.json"
        with fields_path.open("wb") as f:
            f.write(orjson.dumps(self.fields_data))

    def insert(self, data: List[Dict]) -> Dict:
        ids = [x[self.ID_FIELD_NAME] for x in data]
        vectors = [x.pop(self.VECTOR_FIELD_NAME) for x in data]
        self.vector_data[self.ID_FIELD_NAME] = np.concatenate((self.vector_data[self.ID_FIELD_NAME], ids))
        self.vector_data[self.VECTOR_FIELD_NAME] = np.concatenate((self.vector_data[self.VECTOR_FIELD_NAME], vectors))
        self.fields_data.update({x["id"]: x for x in data})
        self.write()
        return {"insert_count": len(data), "ids": ids}

    def _normalize(self, v):
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    def _compute_metric(self, v1, v2):
        metric_type = self.metadata["metric_type"]
        if metric_type == "L2":
            return ((v1[None, :, :] - v2[:, None, :]) ** 2).sum(dim=-1)
        if metric_type == "COSINE":
            return self._normalize(v1) @ self._normalize(v2).T
        if metric_type == "IP":
            return v1 @ v2.T
        raise ValueError(f"Unknown metric_type: {metric_type}")

    def _filter_entity(self, entity: Dict, output_fields: List[str]) -> Dict:
        return {key: entity[key] for key in output_fields}

    def search(self, data: List[Dict], limit: int, output_fields: List[str]) -> List[List[Dict]]:
        scores = self._compute_metric(self.vector_data[self.VECTOR_FIELD_NAME], data)
        topk_idx_batched = np.argpartition(-scores, min(limit, scores.shape[0] - 1), axis=0)[:limit, :].T
        return [
            [
                {
                    "entity": self._filter_entity(
                        self.fields_data[self.vector_data[self.ID_FIELD_NAME][ent_idx]], output_fields
                    ),
                    "distance": scores[ent_idx, batch_idx],
                }
                for ent_idx in topk_idx
            ]
            for batch_idx, topk_idx in enumerate(topk_idx_batched)
        ]


class NaiveVectorDB(BaseVectorDB):
    def __init__(self, uri: str) -> None:
        self.uri = uri

        self.uri_path = Path(uri)
        assert not self.uri_path.is_file(), "NaiveVectorDB uri must be directory, not file"
        self.uri_path.mkdir(parents=True, exist_ok=True)

        self.collections = {}

    def get_uri(self) -> str:
        return self.uri

    def _maybe_load_collection(self, collection_name: str) -> None:
        if collection_name not in self.collections:
            self.collections[collection_name] = NaiveCollection.load(self.uri_path / collection_name)

    def unload_collection(self, collection_name: str) -> None:
        del self.collections[collection_name]

    def create_collection(self, collection_name: str, dimension: int, metric_type: str, id_type: str) -> None:
        self.collections[collection_name] = NaiveCollection.create(
            self.uri_path, collection_name, dimension, metric_type, id_type
        )

    def drop_collection(self, collection_name: str) -> None:
        collection_path = self.uri_path / collection_name
        shutil.rmtree(collection_path)

    def insert(self, collection_name: str, data: List[Dict]) -> Dict:
        self._maybe_load_collection(collection_name)
        res = self.collections[collection_name].insert(data=data)
        return res

    def delete(self, collection_name: str, ids: List[str]) -> Dict:
        self._maybe_load_collection(collection_name)
        res = self.collections[collection_name].delete(ids=ids)
        return res

    def search(self, collection_name: str, data: List[Dict], limit: int, output_fields: List[str]) -> List[List[Dict]]:
        self._maybe_load_collection(collection_name)
        res = self.collections[collection_name].search(data=data, limit=limit, output_fields=output_fields)
        return res

    def query(self, collection_name: str, ids: List[str], output_fields: List[str]) -> List[Dict]:
        self._maybe_load_collection(collection_name)
        res = self.collections[collection_name].query(ids=ids, output_fields=output_fields)
        return res
