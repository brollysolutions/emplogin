from django.contrib import admin
from .models import Attendance, PasswordResetToken, Profile, LeaveRequest, Task, EmployeeGroup, ChatMessage

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('name', 'employee_id', 'date', 'login_time', 'logout_time', 'status')
    list_filter = ('status', 'date', 'dept')
    search_fields = ('name', 'employee_id', 'dept')

@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ('email', 'token', 'created_at', 'is_used')
    list_filter = ('is_used', 'created_at')
    search_fields = ('email', 'token')

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'employee_id', 'total_leaves')
    search_fields = ('user__username', 'employee_id')

@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('employee_name', 'employee_id', 'leave_type', 'start_date', 'end_date', 'status')
    list_filter = ('status', 'leave_type')
    search_fields = ('employee_name', 'employee_id')

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'employee_id', 'status', 'assigned_at')
    list_filter = ('status',)
    search_fields = ('title', 'employee_id')

@admin.register(EmployeeGroup)
class EmployeeGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)

@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('sender_id', 'receiver_id', 'group_id', 'timestamp', 'is_read')
    list_filter = ('is_read', 'timestamp')
    search_fields = ('sender_id', 'receiver_id', 'content')
