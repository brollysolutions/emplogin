from rest_framework import serializers
from .models import Attendance, Task, Profile, LeaveRequest, ChatMessage, EmployeeGroup
from django.contrib.auth.models import User

class EmployeeGroupSerializer(serializers.ModelSerializer):
    member_usernames = serializers.SlugRelatedField(
        many=True,
        read_only=True,
        slug_field='username',
        source='members'
    )
    member_names = serializers.SerializerMethodField()
    
    def get_member_names(self, obj):
        return [user.get_full_name() or user.username for user in obj.members.all()]

    class Meta:
        model = EmployeeGroup
        fields = ['id', 'name', 'description', 'members', 'member_usernames', 'member_names', 'created_at']
        extra_kwargs = {'members': {'required': False}}


class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = '__all__'

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = '__all__'

class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = '__all__'

class LeaveRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveRequest
        fields = '__all__'

class ChatMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = '__all__'

    def get_sender_username(self, obj):
        if not obj.sender_id:
            return "Unknown"
        if obj.sender_id.lower() == 'admin':
            return 'Admin'
        try:
            # Primary: Look up from Attendance records (most reliable — stores full name)
            attendance = Attendance.objects.filter(
                employee_id__iexact=obj.sender_id
            ).exclude(name='').order_by('-timestamp').first()
            if attendance and attendance.name and attendance.name != '—':
                return attendance.name

            # Fallback 1: User model full name
            user = User.objects.filter(username__iexact=obj.sender_id).first()
            if user:
                full_name = user.get_full_name()
                if full_name:
                    return full_name
                return user.username
        except Exception:
            pass
        # Last resort: return the raw sender ID
        return obj.sender_id

