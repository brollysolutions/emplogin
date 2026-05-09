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
    class Meta:
        model = EmployeeGroup
        fields = ['id', 'name', 'description', 'members', 'member_usernames', 'created_at']
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
        if obj.sender_id == 'admin':
            return 'Admin'
        try:
            profile = Profile.objects.filter(employee_id=obj.sender_id).first()
            if profile:
                return profile.user.username
            user = User.objects.filter(username=obj.sender_id).first()
            if user:
                return user.username
        except Exception:
            pass
        return obj.sender_id

