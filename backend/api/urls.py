from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('attendance/', views.attendance_list, name='attendance_list'),
    path('forgot-password/', views.request_password_reset, name='forgot_password'),
    path('reset-password/', views.reset_password, name='reset_password'),
    path('sync-users/', views.sync_users, name='sync_users'),
    path('tasks/', views.task_list, name='task_list'),
    path('tasks/<int:pk>/', views.update_task_status, name='update_task_status'),
    path('leaves/', views.leave_request_list, name='leave_request_list'),
    path('leaves/<int:pk>/approve/', views.approve_leave, name='approve_leave'),
    path('leaves/<int:pk>/notify/', views.mark_notification_read, name='mark_notification_read'),
    path('profiles/', views.profile_list, name='profile_list'),
    path('profile/<str:employee_id>/', views.employee_profile, name='employee_profile'),
    path('messages/', views.message_list, name='message_list'),
    path('messages/read/', views.mark_messages_read, name='mark_messages_read'),
    path('groups/', views.group_list, name='group_list'),
    path('groups/<int:pk>/', views.group_detail, name='group_detail'),
    path('groups/<int:pk>/membership/', views.group_membership, name='group_membership'),
    path('heartbeat/', views.heartbeat, name='heartbeat'),
    path('chat-summaries/', views.chat_summaries, name='chat_summaries'),
    path('test-reminder/', views.send_test_reminder, name='test_reminder'),
]
