from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/', views.dashboard_view, name='dashboard'),
    path('room/create/', views.create_room_view, name='create_room'),
    path('room/join/', views.join_room_view, name='join_room'),
    path('room/join-guest/', views.join_room_guest_view, name='join_room_guest'),
    
    # Ensure this line exists with name='schedule_room':
    path('room/schedule/', views.schedule_room_view, name='schedule_room'),
    
    path('room/<str:room_id>/', views.room_detail_view, name='room_detail'),
]