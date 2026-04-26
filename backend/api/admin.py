from django.contrib import admin
from .models import Attendance, PasswordResetToken

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
