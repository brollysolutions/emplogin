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
            # Case-insensitive lookup for employee_id
            profile = Profile.objects.filter(employee_id__iexact=obj.sender_id).first()
            if profile:
                # Return the name from profile if it looks like a real name
                return profile.name or profile.user.username
            
            # Fallback to username lookup
            user = User.objects.filter(username__iexact=obj.sender_id).first()
            if user:
                return user.get_full_name() or user.username
        except Exception:
            pass
        return obj.sender_id

