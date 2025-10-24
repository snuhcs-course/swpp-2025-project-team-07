from django.urls import path
from . import views

urlpatterns = [
    # Session endpoints
    path('sessions/', views.list_sessions, name='list_sessions'),
    path('sessions/create/', views.create_session, name='create_session'),
    path('sessions/<int:session_id>/', views.get_session, name='get_session'),
    path('sessions/<int:session_id>/update/', views.update_session, name='update_session'),
    path('sessions/<int:session_id>/delete/', views.delete_session, name='delete_session'),

    # Message endpoints
    path('sessions/<int:session_id>/messages/', views.list_messages, name='list_messages'),
    path('sessions/<int:session_id>/messages/create/', views.create_message, name='create_message'),
    path('messages/<int:message_id>/', views.get_message, name='get_message'),
    path('messages/<int:message_id>/update/', views.update_message, name='update_message'),
    path('messages/<int:message_id>/delete/', views.delete_message, name='delete_message'),
]
