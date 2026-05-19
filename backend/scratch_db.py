import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from api.models import Attendance
recs = Attendance.objects.filter(employee_id='BG000169')
for r in recs:
    print(f"Date: {r.date}, IN: {r.login_time}, OUT: {r.logout_time}, HRS: {r.hours}, STATUS: {r.status}")
