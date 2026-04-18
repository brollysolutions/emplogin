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
    status = models.CharField(max_length=50)
    timestamp = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.date}"
