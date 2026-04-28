from django.db import models

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
    timestamp = models.DateTimeField(auto_now=True)

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
