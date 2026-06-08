import os
import sys
import django
from datetime import datetime, timedelta

# Setup Django environment
sys.path.append(r'C:\Users\mouli\OneDrive\Documents\Desktop\emp login\emplogin\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from api.models import Attendance
from django.contrib.auth.models import User
from django.utils import timezone

def test_overtime_calculation():
    print("Starting Backend Overtime Audit...")
    
    # 1. Create a dummy employee if not exists
    username = "test_overtime_user"
    user, created = User.objects.get_or_create(username=username, defaults={'first_name': 'Test', 'last_name': 'User'})
    
    # 2. Create a dummy attendance record with 9 hours of work
    # We simulate a record that hasn't been logged out
    today = timezone.now().date()
    # Delete if exists
    Attendance.objects.filter(employee_id=username, date=today).delete()
    
    # Simulate a record that started 10 hours ago
    start_time_dt = datetime.now() - timedelta(hours=10)
    start_time = start_time_dt.strftime("%I:%M:%S %p")
    last_status_change = timezone.now() - timedelta(hours=1) # Status changed 1 hour before last_active
    last_active = timezone.now() - timedelta(minutes=40)     # Last seen 40 mins ago
    
    rec = Attendance.objects.create(
        employee_id=username,
        name="Test Overtime User",
        dept="Test",
        date=str(today),
        login_time=start_time,
        logout_time="—",
        status="Active",
        hours="09:00:00",
        extra_hours="01:00:00",
        last_status_change=last_status_change,
        last_active=last_active
    )
    
    print(f"Created test record: {rec.hours} work, {rec.extra_hours} overtime. Status: {rec.status}")
    
    # 3. Run the auto_logout command
    from django.core.management import call_command
    print("Running auto_logout command...")
    call_command('auto_logout')
    
    # 4. Verify results
    rec.refresh_from_db()
    print(f"After auto_logout: {rec.hours} work, {rec.extra_hours} overtime. Status: {rec.status}")
    
    if rec.status == "Logged Out" and rec.extra_hours == "1:00:00":
        print("✅ SUCCESS: Overtime preserved and status updated.")
    else:
        print("❌ FAILURE: Results did not match expectations.")
        if rec.extra_hours != "1:00:00":
            print(f"Expected 1:00:00, got {rec.extra_hours}")

if __name__ == "__main__":
    test_overtime_calculation()
