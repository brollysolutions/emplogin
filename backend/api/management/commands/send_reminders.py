import os
import json
import requests
from django.utils import timezone
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.conf import settings
from django.db import IntegrityError

from api.models import Attendance, DailyJobRun, Holiday, LeaveRequest

# "Work From Home" is stored as a leave_type, but those employees are still
# expected to work and log in — so it does NOT exempt them from the alert.
# Only genuine time-off does.
WFH_STILL_REQUIRES_LOGIN = True


def _norm(value):
    """Normalise an identifier for comparison (None-safe, case/space-insensitive)."""
    if not value:
        return ""
    return str(value).strip().lower()


def identifiers_for(user):
    """Every id this user could plausibly be keyed by in the attendance tables.

    Attendance, LeaveRequest, Task and EmployeeSession all key on the SHEET id
    ("BG000169"), while `User.username` is populated from the sheet's `username`
    column — which in this roster holds the person's NAME ("Gundlapalli Lokeswar
    Raju"). Comparing attendance rows against `username` therefore never matched,
    so employees who had logged in were still emailed "you have not logged in".

    Matching against the whole candidate set makes the check correct for both
    roster shapes: profiles synced from the sheet (keyed by sheet_employee_id)
    and older/placeholder accounts whose username IS the employee id.
    """
    profile = getattr(user, 'profile', None)
    candidates = [user.username]
    if profile is not None:
        candidates.append(getattr(profile, 'sheet_employee_id', None))
        candidates.append(profile.employee_id)
    return {_norm(c) for c in candidates if _norm(c)}


def names_for(user):
    """Display names this user could be recorded under.

    A second, independent key on purpose. `Profile.sheet_employee_id` is only
    populated once a sheet sync has run, so on a freshly-migrated database the id
    join alone would still match nothing and mail the whole roster. Attendance
    rows also carry the employee's display name, which in this roster equals
    `User.username`, so the name gives a reliable fallback that works before any
    sync has happened.
    """
    candidates = [user.username, user.get_full_name(), user.first_name]
    return {_norm(c) for c in candidates if _norm(c)}


class Command(BaseCommand):
    help = (
        "Emails only the employees who have not logged in by office start time "
        "(10:00 AM IST). Skips Sundays, admin-declared holidays, and anyone on "
        "approved leave."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Report who WOULD be emailed without sending anything or marking the day done.",
        )
        parser.add_argument(
            '--only-email',
            dest='only_email',
            default=None,
            help=(
                "Restrict sending to this single address. Intended for testing "
                "against the local database so a test run cannot mail the real roster."
            ),
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help="Ignore the 'already sent today' marker. Use with --dry-run or --only-email.",
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        only_email = _norm(options.get('only_email'))
        force = options.get('force', False)

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

        # 4. Has today already been done? This marker lives in the DATABASE, which
        #    is bind-mounted and therefore survives a container rebuild/restart.
        #    The old on-disk lock did not, so every redeploy re-sent the morning
        #    alerts to people who had already received them.
        today_str = now.strftime('%Y-%m-%d')
        if not force and self._already_sent(today, today_str):
            self.stdout.write(f"Alerts already sent for {today_str}. Skipping.")
            return

        # Delivered via the Google Apps Script relay (HTTPS), NOT direct SMTP.
        # DigitalOcean blocks outbound SMTP ports, so Django's send_mail() fails
        # with "[Errno 101] Network is unreachable".
        script_url = getattr(settings, 'GOOGLE_SCRIPT_URL', None)
        if not script_url and not dry_run:
            self.stderr.write(
                "GOOGLE_SCRIPT_URL not configured; cannot send alerts. "
                "Aborting without marking as sent (will retry)."
            )
            return

        # 4b. Refresh the roster from the Google Sheet BEFORE selecting who to
        # email, so employees added to the sheet today are covered even if no
        # admin has clicked "Sync" yet. Fail-soft.
        if not dry_run:
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
        todays_rows = Attendance.objects.filter(date=attendance_date).values_list(
            'employee_id', 'name', 'login_time'
        )
        # A row with no usable login_time means the record exists but the
        # employee never actually logged in.
        real_logins = [
            (eid, name)
            for eid, name, login_time in todays_rows
            if login_time and str(login_time).strip() not in ("", "—", "-")
        ]
        logged_in_ids = {_norm(eid) for eid, _ in real_logins if _norm(eid)}
        logged_in_names = {_norm(name) for _, name in real_logins if _norm(name)}

        # 6. Who is on approved leave covering today? Work From Home is excluded
        #    because those employees still work and still log in.
        leave_qs = LeaveRequest.objects.filter(
            status='Approved',
            start_date__lte=today,
            end_date__gte=today,
        )
        if WFH_STILL_REQUIRES_LOGIN:
            leave_qs = leave_qs.exclude(leave_type__iexact='Work From Home')
        leave_rows = leave_qs.values_list('employee_id', 'employee_name')
        on_leave_ids = {_norm(eid) for eid, _ in leave_rows if _norm(eid)}
        on_leave_names = {_norm(name) for _, name in leave_rows if _norm(name)}

        # Every active employee, including those with no/placeholder email. The
        # loop below filters addresses itself, and the blast-radius guard must
        # judge whether the identifier join works across the WHOLE roster — if
        # this excluded unmailable accounts, a roster of placeholder addresses
        # would look like a broken join and abort a legitimate run.
        # select_related pulls each Profile in the same query so identifiers_for()
        # does not fire one extra SELECT per employee.
        users = User.objects.filter(is_active=True).select_related('profile')

        count = 0
        skipped = 0
        failed = 0
        matched = 0  # employees whose attendance row we successfully recognised
        pending = []  # (email, subject, body) built first, sent only after the guard
        self.stdout.write(
            f"{users.count()} active employee(s); {len(real_logins)} logged in today, "
            f"{len(on_leave_ids)} on approved leave. Checking who to alert..."
        )

        for user in users:
            # Resolve identity FIRST, before any email filtering, so `matched`
            # reflects whether the join works rather than whether this particular
            # employee happens to be mailable.
            #
            # Match on every id this employee could be keyed by, not just
            # username — see identifiers_for() for why. The name set is a second,
            # independent key that works before any sheet sync has populated
            # sheet_employee_id.
            ids = identifiers_for(user)
            names = names_for(user)
            is_logged_in = bool((ids & logged_in_ids) or (names & logged_in_names))
            if is_logged_in:
                matched += 1

            email = (user.email or "").strip()

            # Skip obviously-invalid / placeholder addresses (spaces, no '@',
            # or the seeded @example.com test accounts).
            if (not email) or (" " in email) or ("@" not in email) or email.lower().endswith("@example.com"):
                skipped += 1
                self.stdout.write(f"   - Skipping invalid email: '{email}'")
                continue

            # Testing guard: never mail the real roster from a local test run.
            if only_email and _norm(email) != only_email:
                skipped += 1
                continue

            if is_logged_in:
                skipped += 1
                self.stdout.write(f"   - {user.username} already logged in; no alert.")
                continue

            if (ids & on_leave_ids) or (names & on_leave_names):
                skipped += 1
                self.stdout.write(f"   - {user.username} is on approved leave; no alert.")
                continue

            name = user.first_name or user.username
            subject = "Attendance Alert: No Login Recorded"
            body = (
                f"Hello {name},\n\n"
                f"Our records show that you have not logged in to the Brolly Solutions "
                f"Attendance System yet today, and the scheduled login time of "
                f"{office_start} has passed.\n\n"
                f"If you are working, please log in and 'Sync to Cloud' so your "
                f"attendance is recorded. If this is a mistake or you are on leave, "
                f"please inform your manager.\n\n"
                f"Regards,\n"
                f"Brolly Solutions Team"
            )

            pending.append((email, subject, body, sorted(ids)))

        # 6b. Blast-radius guard. If people demonstrably logged in today but we
        #     recognised NONE of them, the identifier join is broken (e.g. the
        #     roster was re-keyed and no sheet sync has run). That is exactly the
        #     failure that mailed the entire company "you have not logged in"
        #     every morning, so refuse to send rather than repeat it. The day is
        #     deliberately left unmarked so a later run can succeed once the
        #     roster is consistent again.
        if real_logins and matched == 0:
            self.stderr.write(
                self.style.ERROR(
                    f"ABORTING: {len(real_logins)} employee(s) logged in today but none "
                    f"could be matched to a user account. The employee-id/name join is "
                    f"broken, so no alerts were sent — mailing now would tell people who "
                    f"are already at work that they never logged in. "
                    f"Run 'python manage.py sync_sheet' (or the admin Sync button) to "
                    f"repopulate Profile.sheet_employee_id, then re-run."
                )
            )
            return

        for email, subject, body, ids in pending:
            if dry_run:
                self.stdout.write(f"   - [DRY RUN] would alert {email} (ids={ids})")
                count += 1
                continue

            if self.send_via_script(script_url, email, subject, body):
                self.stdout.write(f"   - Alert sent to {email}")
                count += 1
            else:
                failed += 1
                self.stdout.write(f"   - FAILED to send alert to {email}")

        # 7. Mark the day as done — but only when it's genuinely done.
        #    - count > 0            → at least one alert went out: mark.
        #    - count == 0, failed 0 → nobody needed alerting (everyone logged in
        #                             or on leave): mark, retrying changes nothing.
        #    - count == 0, failed>0 → every real attempt failed (e.g. relay down):
        #                             do NOT mark, so the traffic trigger retries.
        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f'[DRY RUN] {count} employee(s) would be alerted; nothing sent, day not marked.')
            )
            return

        if count > 0 or failed == 0:
            self._mark_sent(
                today,
                f"Sent at {now.isoformat()} to {count} users "
                f"({skipped} skipped, {failed} failed).",
            )
        else:
            self.stdout.write(
                f"All {failed} send attempt(s) failed; not marking so a later run can retry today."
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Sent {count} no-login alert(s) ({skipped} skipped, {failed} failed).'
            )
        )

    # ── Daily "already done" marker ──────────────────────────────────────────
    def _legacy_lock_path(self, today_str):
        """Path of the pre-DB lock file, still honoured for one deploy.

        Without this, the first deploy carrying the DB marker would find no row
        for today and re-send alerts that the old file-based run had already sent.
        """
        return os.path.join(str(settings.BASE_DIR), f'.reminders_sent_{today_str}')

    def _already_sent(self, today, today_str):
        if DailyJobRun.objects.filter(
            job_name=DailyJobRun.MORNING_REMINDERS, run_date=today
        ).exists():
            return True

        # Backwards compatibility: a lock file written by the previous version
        # before this deploy still counts as "sent". Backfill it into the DB so
        # the next restart doesn't depend on the file surviving.
        if os.path.exists(self._legacy_lock_path(today_str)):
            self._mark_sent(today, "Backfilled from legacy lock file.")
            return True

        return False

    def _mark_sent(self, today, detail):
        try:
            DailyJobRun.objects.get_or_create(
                job_name=DailyJobRun.MORNING_REMINDERS,
                run_date=today,
                defaults={'detail': detail[:255]},
            )
        except IntegrityError:
            # Another worker claimed the same day between the check and the
            # write — that is the desired end state, so treat it as success.
            pass
        except Exception as e:
            self.stderr.write(f"Error recording daily reminder run: {e}")

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
