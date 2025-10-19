from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    # User Auth
    path('auth/signup/', views.signup, name='signup'),
    path('auth/login/', views.login, name='login'),
    path('auth/logout/', views.logout, name='logout'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # User Profile
    path('user/profile/', views.profile, name='user_profile'),

    # Collections (MOCK APIs)
    path('collections/', views.mock_collections, name='mock_collections'),
    path('collections/<str:collection_id>/keys/', views.mock_store_keys, name='mock_store_keys'),
    path('collections/search/', views.mock_search_collections, name='mock_search_collections'),
    path('collections/<str:collection_id>/return/', views.mock_return_from_collection, name='mock_retrieve_from_collection'),
]
