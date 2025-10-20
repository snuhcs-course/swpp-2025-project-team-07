from django.urls import path
from . import views

urlpatterns = [
    # Collections (MOCK APIs)
    path('', views.mock_collections, name='mock_collections'),
    path('<str:collection_id>/keys/', views.mock_store_keys, name='mock_store_keys'),
    path('search/', views.mock_search_collections, name='mock_search_collections'),
    path('<str:collection_id>/query/', views.mock_query_collection, name='mock_query_collection'),
]
