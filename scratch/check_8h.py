import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from api.models import Attendance

# Check today's records with hours >= 8
from datetime import datetime
today_str = datetime.now().strftime('%d %b %Y')
recs = Attendance.objects.filter(date=today_str, hours__startswith='08')
print(f"Found {recs.count()} records with >= 8 hours for {today_str}")
for r in recs:
    print(f"User: {r.name} ({r.employee_id}), Hours: {r.hours}, Notified: {r.eight_hour_notified}")
