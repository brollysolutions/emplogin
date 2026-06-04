import os
import django
import sys

# Setup django
sys.path.append(r'c:\Users\lokes\OneDrive\Desktop\login\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from api.models import Attendance, Profile

from django.contrib.auth.models import User
print("\nChecking Users who logged in recently:")
users = User.objects.all().order_by('-last_login')[:10]
for u in users:
    print(f"User: {u.username}, Last Login: {u.last_login}")



print("\nListing ALL attendance records:")
all_records = Attendance.objects.all()
for r in all_records:
    print(f"ID: {r.id}, Name: {r.name}, EmpID: {r.employee_id}, Date: '{r.date}', Status: {r.status}")
