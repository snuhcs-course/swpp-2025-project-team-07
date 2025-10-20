from django.urls import path
from . import views


urlpatterns = [
    path('vectordb/create_collection/', views.vectordb_create_collection, name='create_collection'),
    path('vectordb/drop_collection/', views.vectordb_drop_collection, name='drop_collection'),
    path('vectordb/insert/', views.vectordb_insert, name='insert'),
    path('vectordb/delete/', views.vectordb_delete, name='delete'),
    path('vectordb/search/', views.vectordb_search, name='search'),
    path('vectordb/query/', views.vectordb_query, name='query'),
]
