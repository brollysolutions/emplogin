import os
import json
import requests
from django.utils import timezone
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.conf import settings
from api.models import Profile

class Command(BaseCommand):
    help = 'Sends morning login reminders to employees at 9:30 AM'

    def handle(self, *args, **options):
        # Use timezone.localtime to get Asia/Kolkata time instead of Docker's UTC time
        now = timezone.localtime(timezone.now())
        
        # 1. Skip Sunday (6 is Sunday)
        if now.weekday() == 6:
            self.stdout.write("Today is Sunday. Skipping reminders.")
            return

        # 2. Check if it's too early (before 9:25 AM)
        # We allow a small window before 9:30 AM just in case, 
        # but usually we want it to trigger around 9:30 AM.
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
        # In local, this will only find the 4-5 employees you have in SQLite.
        # In production, it will find everyone.
        users = User.objects.filter(is_active=True).exclude(email='')
        
        # Optionally exclude admins to avoid spamming yourself
        # users = users.exclude(is_staff=True)

        count = 0
        self.stdout.write(f"Found {users.count()} users with emails. Sending morning reminders...")
        
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

            success = self.send_email_via_google(user.email, subject, body)
            if success:
                self.stdout.write(f"   - Reminder sent to {user.email}")
                count += 1
            else:
                self.stdout.write(f"   - FAILED to send reminder to {user.email}")

        # 5. Create lock file so it only runs once per day
        try:
            with open(lock_file, 'w') as f:
                f.write(f"Sent at {now.isoformat()} to {count} users.")
        except Exception as e:
            self.stderr.write(f"Error creating lock file: {e}")

        self.stdout.write(self.style.SUCCESS(f'Successfully sent {count} morning reminders.'))

    def send_email_via_google(self, to_email, subject, body):
        script_url = getattr(settings, 'GOOGLE_SCRIPT_URL', None)
        if not script_url:
            return False

        try:
            r = requests.post(
                script_url,
                data=json.dumps({
                    "action": "sendEmail",
                    "to": to_email,
                    "subject": subject,
                    "body": body
                }),
                headers={"Content-Type": "text/plain"},
                allow_redirects=True,
                timeout=15
            )
            return r.status_code == 200
        except Exception as e:
            self.stderr.write(f"Request exception for {to_email}: {str(e)}")
            return False
