from django.urls import path
from . import views

urlpatterns = [
    path('attendance/', views.attendance_list, name='attendance_list'),
    path('forgot-password/', views.request_password_reset, name='forgot_password'),
    path('reset-password/', views.reset_password, name='reset_password'),
    path('sync-users/', views.sync_users, name='sync_users'),
]
