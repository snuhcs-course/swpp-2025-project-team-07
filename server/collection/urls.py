from django.urls import path
from . import views

urlpatterns = [
    # Collections
    path("insert/", views.insert_to_collection, name="store_keys"),
    path("search/", views.search_collections, name="search_collections"),
    path("query/", views.query_collection, name="query_collection"),
]
