import os
import json
import requests
from django.utils import timezone
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.conf import settings

from api.models import Attendance, Holiday, LeaveRequest

# "Work From Home" is stored as a leave_type, but those employees are still
# expected to work and log in — so it does NOT exempt them from the alert.
# Only genuine time-off does.
WFH_STILL_REQUIRES_LOGIN = True


class Command(BaseCommand):
    help = (
        "Emails only the employees who have not logged in by office start time "
        "(10:00 AM IST). Skips Sundays, admin-declared holidays, and anyone on "
        "approved leave."
    )

    def handle(self, *args, **options):
        # timezone.localtime gives Asia/Kolkata (TIME_ZONE in settings.py) rather
        # than the container's UTC clock.
        now = timezone.localtime(timezone.now())
        today = now.date()

        # 1. Working days are Monday–Saturday. Python weekday(): Sunday == 6.
        if now.weekday() == 6:
            self.stdout.write("Today is Sunday (non-working day). Skipping.")
            return

        # 2. Skip admin-declared holidays.
        holiday = Holiday.objects.filter(date=today).first()
        if holiday:
            self.stdout.write(f"Today is a declared holiday ({holiday.name}). Skipping.")
            return

        # 3. Only run once office start has passed — before that, "hasn't logged
        #    in yet" isn't late yet.
        office_start = getattr(settings, 'OFFICE_START_TIME', '10:00')
        current_time_str = now.strftime('%H:%M')
        if current_time_str < office_start:
            self.stdout.write(
                f"It's {current_time_str}; office starts at {office_start}. Nothing to do yet."
            )
            return

        # 4. Check if already sent today
        today_str = now.strftime('%Y-%m-%d')
        lock_file = os.path.join(settings.BASE_DIR, f'.reminders_sent_{today_str}')
        if os.path.exists(lock_file):
            self.stdout.write(f"Alerts already sent for {today_str}. Skipping.")
            return

        # Delivered via the Google Apps Script relay (HTTPS), NOT direct SMTP.
        # DigitalOcean blocks outbound SMTP ports, so Django's send_mail() fails
        # with "[Errno 101] Network is unreachable".
        script_url = getattr(settings, 'GOOGLE_SCRIPT_URL', None)
        if not script_url:
            self.stderr.write(
                "GOOGLE_SCRIPT_URL not configured; cannot send alerts. "
                "Aborting without marking as sent (will retry)."
            )
            return

        # 4b. Refresh the roster from the Google Sheet BEFORE selecting who to
        # email, so employees added to the sheet today are covered even if no
        # admin has clicked "Sync" yet. Fail-soft.
        try:
            from api.employee_sync import sync_from_sheet
            summary = sync_from_sheet()
            if summary is not None:
                self.stdout.write(f"Roster synced from sheet: {summary}")
            else:
                self.stdout.write("Sheet sync skipped/unavailable; using existing DB roster.")
        except Exception as e:
            self.stderr.write(f"Sheet sync before alerts failed (continuing): {e}")

        # 5. Who already logged in today? Attendance stores the date as a display
        #    string ("01 Aug 2026"), matching how records are written.
        attendance_date = now.strftime('%d %b %Y')
        logged_in_ids = {
            eid.strip().lower()
            for eid, login_time in Attendance.objects.filter(
                date=attendance_date
            ).values_list('employee_id', 'login_time')
            # A row with no usable login_time means the record exists but the
            # employee never actually logged in.
            if eid and login_time and str(login_time).strip() not in ("", "—", "-")
        }

        # 6. Who is on approved leave covering today? Work From Home is excluded
        #    because those employees still work and still log in.
        leave_qs = LeaveRequest.objects.filter(
            status='Approved',
            start_date__lte=today,
            end_date__gte=today,
        )
        if WFH_STILL_REQUIRES_LOGIN:
            leave_qs = leave_qs.exclude(leave_type__iexact='Work From Home')
        on_leave_ids = {
            eid.strip().lower()
            for eid in leave_qs.values_list('employee_id', flat=True)
            if eid
        }

        users = User.objects.filter(is_active=True).exclude(email='')

        count = 0
        skipped = 0
        failed = 0
        self.stdout.write(
            f"{users.count()} active employee(s); {len(logged_in_ids)} already logged in, "
            f"{len(on_leave_ids)} on approved leave. Checking who to alert..."
        )

        for user in users:
            email = (user.email or "").strip()
            employee_id = (user.username or "").strip().lower()

            # Skip obviously-invalid / placeholder addresses (spaces, no '@',
            # or the seeded @example.com test accounts).
            if (not email) or (" " in email) or ("@" not in email) or email.lower().endswith("@example.com"):
                skipped += 1
                self.stdout.write(f"   - Skipping invalid email: '{email}'")
                continue

            if employee_id in logged_in_ids:
                skipped += 1
                continue

            if employee_id in on_leave_ids:
                skipped += 1
                self.stdout.write(f"   - {user.username} is on approved leave; no alert.")
                continue

            name = user.first_name or user.username
            subject = "Attendance Alert: No Login Recorded"
            body = (
                f"Hello {name},\n\n"
                f"Our records show that you have not logged in to the Brolly Solutions "
                f"Attendance System yet today, and the scheduled login time of "
                f"10:00 AM has passed.\n\n"
                f"If you are working, please log in and 'Sync to Cloud' so your "
                f"attendance is recorded. If this is a mistake or you are on leave, "
                f"please inform your manager.\n\n"
                f"Regards,\n"
                f"Brolly Solutions Team"
            )

            if self.send_via_script(script_url, email, subject, body):
                self.stdout.write(f"   - Alert sent to {email}")
                count += 1
            else:
                failed += 1
                self.stdout.write(f"   - FAILED to send alert to {email}")

        # 7. Mark the day as done — but only when it's genuinely done.
        #    - count > 0            → at least one alert went out: lock.
        #    - count == 0, failed 0 → nobody needed alerting (everyone logged in
        #                             or on leave): lock, retrying changes nothing.
        #    - count == 0, failed>0 → every real attempt failed (e.g. relay down):
        #                             do NOT lock, so the traffic trigger retries.
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
                f'Sent {count} no-login alert(s) ({skipped} skipped, {failed} failed).'
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
