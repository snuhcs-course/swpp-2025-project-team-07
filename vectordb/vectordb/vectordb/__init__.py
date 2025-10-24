from .base_vectordb import BaseVectorDB
from .milvus_vectordb import MilvusVectorDB
from .naive_vectordb import NaiveVectorDB


__all__ = [
    "vectordb_factory",
    "BaseVectorDB",
]


def vectordb_factory(vectordb_name: str, uri: str) -> BaseVectorDB:
    if vectordb_name == "naive":
        return NaiveVectorDB(uri=uri)
    if vectordb_name == "milvus":
        return MilvusVectorDB(uri=uri)
    else:
        raise ValueError(f"Unknown vectordb_name: {vectordb_name}")
