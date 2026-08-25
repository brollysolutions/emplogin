from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


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
    break_logs = models.TextField(blank=True, default="[]")
    offline_logs = models.TextField(blank=True, default="[]")
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
    # The sheet's `id` column (e.g. "EMP001"). Stored separately from
    # `employee_id` because the two are not reliably the same value: the sheet
    # sync sets `employee_id` from the sheet's `username` column, while
    # `employee_profile` auto-creation sets it from whatever id the client sent.
    # Every other table (Attendance, Task, LeaveRequest, EmployeeSession) keys on
    # the sheet id, so login has to be able to return it unambiguously.
    sheet_employee_id = models.CharField(max_length=50, db_index=True, null=True, blank=True)
    # Mirrored from the sheet; the client needs both at login to create
    # attendance rows and render the dashboard header.
    dept = models.CharField(max_length=100, null=True, blank=True)
    designation = models.CharField(max_length=255, null=True, blank=True)
    # True once this profile has been reconciled against the sheet roster.
    # `/api/v1/login/` refuses to accept a stored password hash for profiles
    # where this is False, because `employee_profile` auto-creates placeholder
    # users whose password is set to their own employee_id — those must never
    # become a login path.
    sheet_synced = models.BooleanField(default=False)
    total_leaves = models.IntegerField(default=16)
    photo = models.ImageField(upload_to='profile_photos/', null=True, blank=True)
    aadhar_number = models.CharField(max_length=20, null=True, blank=True)
    aadhar_card = models.ImageField(upload_to='documents/', null=True, blank=True)
    pan_number = models.CharField(max_length=20, null=True, blank=True)
    pan_card = models.ImageField(upload_to='documents/', null=True, blank=True)
    contact = models.CharField(max_length=20, null=True, blank=True)
    dob = models.CharField(max_length=50, null=True, blank=True)
    location = models.CharField(max_length=255, null=True, blank=True)
    joining_date = models.CharField(max_length=50, null=True, blank=True)
    
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

class EmployeeSession(models.Model):
    """Server-side login session so a session can be validated and revoked
    across ALL of an employee's devices.

    Created when an employee logs in (the browser matches credentials against the
    Google-Sheet list, then registers the session here). Every device validates
    and polls this record; when it is revoked (logout elsewhere) or expires, the
    other devices see valid=False on their next poll and log themselves out.
    """
    token = models.CharField(max_length=100, unique=True, db_index=True)
    employee_id = models.CharField(max_length=50, db_index=True)
    employee_name = models.CharField(max_length=255, blank=True, default="")
    device_label = models.CharField(max_length=255, blank=True, default="")
    # Set only by an admin login. Gates the company-wide endpoints (approvals,
    # roster, groups) once those are moved behind IsAdminSession.
    is_admin = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    last_seen = models.DateTimeField(auto_now=True)

    def is_valid(self):
        return self.is_active and self.expires_at > timezone.now()

    def __str__(self):
        state = "active" if self.is_active else "revoked"
        return f"{self.employee_id} session ({state})"

class Holiday(models.Model):
    date = models.DateField(unique=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.date}"


class DailyJobRun(models.Model):
    """Marks a once-per-day background job as already done for a given date.

    This lives in the database rather than in a lock file under BASE_DIR because
    the container filesystem is NOT persisted: docker-compose bind-mounts only
    db.sqlite3 and media/, so anything written to /app is discarded whenever the
    container is rebuilt or recreated. A restart therefore wiped the
    ".reminders_sent_<date>" lock and the morning no-login alerts went out a
    second time to people who had already received them.

    The unique constraint also makes claiming a day atomic across the 4 gunicorn
    workers, which per-worker in-memory guards cannot do on their own.
    """

    MORNING_REMINDERS = "morning_reminders"

    job_name = models.CharField(max_length=50, db_index=True)
    run_date = models.DateField(db_index=True)
    completed_at = models.DateTimeField(auto_now_add=True)
    detail = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        unique_together = ("job_name", "run_date")

    def __str__(self):
        return f"{self.job_name} @ {self.run_date}"
