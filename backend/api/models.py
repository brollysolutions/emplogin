from django.db import models
from django.contrib.auth.models import User


class Attendance(models.Model):
    employee_id = models.CharField(max_length=50)
    name = models.CharField(max_length=255)
    dept = models.CharField(max_length=100)
    date = models.CharField(max_length=50)
    login_time = models.CharField(max_length=50)
    logout_time = models.CharField(max_length=50, default="—")
    hours = models.CharField(max_length=50, default="—")
    extra_hours = models.CharField(max_length=50, default="—")
    tasks = models.TextField(blank=True, default="—")
    total_break_time = models.CharField(max_length=50, default="00:00:00")
    status = models.CharField(max_length=50)
    last_status_change = models.DateTimeField(null=True, blank=True)
    last_active = models.DateTimeField(null=True, blank=True)
    eight_hour_notified = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now=True)
    screenshot = models.ImageField(upload_to='attendance_screenshots/', null=True, blank=True)


    def __str__(self):
        return f"{self.name} - {self.date}"

class PasswordResetToken(models.Model):
    email = models.EmailField()
    username = models.CharField(max_length=150, null=True, blank=True)
    token = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.email} - {self.token}"

class Task(models.Model):
    STATUS_CHOICES = [
        ('Assigned', 'Assigned'),
        ('Viewed', 'Viewed'),
        ('Completed', 'Completed'),
    ]
    employee_id = models.CharField(max_length=50)
    title = models.CharField(max_length=255)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Assigned')
    assigned_at = models.DateTimeField(auto_now_add=True)
    viewed_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    employee_id = models.CharField(max_length=50, unique=True, null=True, blank=True)
    total_leaves = models.IntegerField(default=16)
    
    def __str__(self):
        return f"{self.user.username} Profile"

class LeaveRequest(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
    ]
    employee_id = models.CharField(max_length=50)
    employee_name = models.CharField(max_length=255)
    leave_type = models.CharField(max_length=50, default="Casual Leave")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Pending')
    applied_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_comment = models.TextField(blank=True, null=True)
    is_notified = models.BooleanField(default=False) # For employee dashboard notifications

    def __str__(self):
        return f"{self.employee_name} ({self.start_date} to {self.end_date})"

class ChatMessage(models.Model):
    sender_id = models.CharField(max_length=50) # employee_id or 'admin'
    receiver_id = models.CharField(max_length=50, null=True, blank=True) # employee_id or 'admin', null if group msg
    group_id = models.CharField(max_length=50, null=True, blank=True) # if present, it's a group chat
    content = models.TextField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    image = models.ImageField(upload_to='chat_images/', null=True, blank=True)

    def __str__(self):
        return f"From {self.sender_id} to {self.receiver_id} at {self.timestamp}"
class EmployeeGroup(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    members = models.ManyToManyField(User, related_name='employee_groups')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
