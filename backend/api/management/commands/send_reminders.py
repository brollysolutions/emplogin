import os
import json
import requests
from django.utils import timezone
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.conf import settings
from api.models import Profile

from django.core.mail import send_mail

class Command(BaseCommand):
    help = 'Sends morning login reminders to employees at 9:30 AM'

    def handle(self, *args, **options):
        # Use timezone.localtime to get Asia/Kolkata time instead of Docker's UTC time
        # This assumes TIME_ZONE = 'Asia/Kolkata' is set in settings.py
        now = timezone.localtime(timezone.now())
        
        # 1. Skip Sunday (6 is Sunday in Python's weekday())
        if now.weekday() == 6:
            self.stdout.write("Today is Sunday. Skipping reminders.")
            return

        # 2. Check if it's too early (before 9:25 AM)
        current_time_str = now.strftime('%H:%M')
        if current_time_str < "09:25":
            self.stdout.write(f"It's too early ({current_time_str}). Waiting for 9:30 AM.")
            return

        # 3. Check if already sent today
        today_str = now.strftime('%Y-%m-%d')
        lock_file = os.path.join(settings.BASE_DIR, f'.reminders_sent_{today_str}')
        
        if os.path.exists(lock_file):
            self.stdout.write(f"Reminders already sent for {today_str}. Skipping.")
            return

        # 4. Get employees
        users = User.objects.filter(is_active=True).exclude(email='')
        
        count = 0
        self.stdout.write(f"Found {users.count()} users with emails. Sending morning reminders via SMTP...")
        
        for user in users:
            # Prepare message
            name = user.first_name or user.username
            subject = "Morning Reminder: Brolly Attendance System"
            body = (
                f"Good Morning {name}!\n\n"
                f"This is a friendly reminder from Brolly Solutions Attendance System.\n\n"
                f"The scheduled login time is 10:00 AM. Please make sure to log in on time "
                f"and 'Sync to Cloud' to record your presence.\n\n"
                f"Have a great and productive day ahead!\n\n"
                f"Regards,\n"
                f"Brolly Solutions Team"
            )

            try:
                send_mail(
                    subject,
                    body,
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                    fail_silently=False,
                )
                self.stdout.write(f"   - Reminder sent to {user.email}")
                count += 1
            except Exception as e:
                self.stdout.write(f"   - FAILED to send reminder to {user.email}: {e}")

        # 5. Create lock file so it only runs once per day
        try:
            with open(lock_file, 'w') as f:
                f.write(f"Sent at {now.isoformat()} to {count} users.")
        except Exception as e:
            self.stderr.write(f"Error creating lock file: {e}")

        self.stdout.write(self.style.SUCCESS(f'Successfully sent {count} morning reminders.'))
