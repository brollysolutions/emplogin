import os
import json
import requests
from django.utils import timezone
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.conf import settings


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

        # Reminders are delivered via the Google Apps Script relay (HTTPS), NOT direct
        # SMTP. DigitalOcean blocks outbound SMTP ports, so Django's send_mail() fails
        # with "[Errno 101] Network is unreachable". This mirrors the working email
        # path already used in auto_logout.py (send_warning_email).
        script_url = getattr(settings, 'GOOGLE_SCRIPT_URL', None)
        if not script_url:
            self.stderr.write(
                "GOOGLE_SCRIPT_URL not configured; cannot send reminders. "
                "Aborting without marking as sent (will retry)."
            )
            return

        # 4. Get employees
        users = User.objects.filter(is_active=True).exclude(email='')

        count = 0
        skipped = 0
        failed = 0
        self.stdout.write(
            f"Found {users.count()} users with emails. "
            f"Sending morning reminders via Google Script relay..."
        )

        for user in users:
            email = (user.email or "").strip()

            # Skip obviously-invalid / placeholder addresses (spaces, no '@',
            # or the seeded @example.com test accounts) so they don't inflate the
            # failure log or waste relay calls.
            if (not email) or (" " in email) or ("@" not in email) or email.lower().endswith("@example.com"):
                skipped += 1
                self.stdout.write(f"   - Skipping invalid email: '{email}'")
                continue

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

            if self.send_via_script(script_url, email, subject, body):
                self.stdout.write(f"   - Reminder sent to {email}")
                count += 1
            else:
                failed += 1
                self.stdout.write(f"   - FAILED to send reminder to {email}")

        # 5. Mark the day as done — but only when it's genuinely done.
        #    - count > 0            → at least one reminder went out: lock.
        #    - count == 0, failed 0 → nothing valid to send (all skipped): lock,
        #                             since retrying can't change the outcome.
        #    - count == 0, failed>0 → every real attempt failed (e.g. relay down):
        #                             do NOT lock, so the traffic trigger retries
        #                             later the same day.
        if count > 0 or failed == 0:
            try:
                with open(lock_file, 'w') as f:
                    f.write(
                        f"Sent at {now.isoformat()} to {count} users "
                        f"({skipped} skipped, {failed} failed)."
                    )
            except Exception as e:
                self.stderr.write(f"Error creating lock file: {e}")
        else:
            self.stdout.write(
                f"All {failed} send attempt(s) failed; not locking so a later run can retry today."
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully sent {count} morning reminders ({skipped} skipped, {failed} failed).'
            )
        )

    def send_via_script(self, script_url, to_email, subject, body):
        """Send a single email through the Google Apps Script relay over HTTPS.

        Returns True on HTTP 200, False otherwise. Uses the same request shape as
        auto_logout.send_warning_email so both paths hit the identical Apps Script.
        """
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
            self.stderr.write(f"   - Email request exception for {to_email}: {str(e)}")
            return False
