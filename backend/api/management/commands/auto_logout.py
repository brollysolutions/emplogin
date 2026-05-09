import os
import json
import requests
from datetime import datetime
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.conf import settings
from django.db.models import Q
from api.models import Attendance, Profile

class Command(BaseCommand):
    help = 'Automatically logs out hanging sessions and sends warnings'

    def handle(self, *args, **options):
        # Date format in DB: '28 Apr 2026'
        today_str = datetime.now().strftime('%d %b %Y')
        
        # Include more variations of active status to be safe
        active_statuses = [
            'Active', 'On Break', 'working', 'break', 'Login', 
            'active', 'on break', 'Working', 'Break', 'login',
            'In Progress', 'in progress', 'Started'
        ]
        
        hanging = Attendance.objects.exclude(date=today_str).filter(
            status__in=active_statuses
        )
        
        count = 0
        processed = 0
        self.stdout.write(f"Searching for hanging sessions (not {today_str})...")
        self.stdout.write(f"Found {hanging.count()} potential records.")
        
        for rec in hanging:
            try:
                processed += 1
                self.stdout.write(f"[{processed}] Processing hanging session for {rec.name} (ID: {rec.employee_id}) on {rec.date} (Status: {rec.status})")
                
                # 1. Update status and logout time
                original_status = rec.status
                rec.logout_time = "11:59:59 PM"
                # Default status if calculation fails
                rec.status = "Complete (Auto)"

                # 2. Recalculate Hours and Overtime
                try:
                    # Clean up time string
                    if rec.login_time and rec.login_time != "—":
                        lt_str = rec.login_time.replace('am', 'AM').replace('pm', 'PM').strip()
                        login_dt = datetime.strptime(lt_str, '%I:%M:%S %p')
                        logout_dt = datetime.strptime("11:59:59 PM", '%I:%M:%S %p')
                        
                        duration_seconds = (logout_dt - login_dt).total_seconds()
                        
                        # Subtract breaks
                        break_str = rec.total_break_time or "00:00:00"
                        break_parts = break_str.split(':')
                        if len(break_parts) == 3:
                            break_seconds = int(break_parts[0])*3600 + int(break_parts[1])*60 + int(break_parts[2])
                            duration_seconds -= break_seconds
                        
                        if duration_seconds < 0: duration_seconds = 0
                        
                        # Format work hours
                        wh = int(duration_seconds // 3600)
                        wm = int((duration_seconds % 3600) // 60)
                        ws = int(duration_seconds % 60)
                        rec.hours = f"{wh:02d}:{wm:02d}:{ws:02d}"
                        
                        # Calculate overtime (Goal = 8 hours)
                        GOAL_SECONDS = 8 * 3600
                        if duration_seconds > GOAL_SECONDS:
                            ot_seconds = duration_seconds - GOAL_SECONDS
                            oh = int(ot_seconds // 3600)
                            om = int((ot_seconds % 3600) // 60)
                            os = int(ot_seconds % 60)
                            rec.extra_hours = f"{oh:02d}:{om:02d}:{os:02d}"
                        else:
                            rec.extra_hours = "—"
                        
                        # Determine Badge Status
                        HALF_DAY = 4.5 * 3600
                        if duration_seconds >= GOAL_SECONDS:
                            rec.status = "Full Day"
                        elif duration_seconds >= HALF_DAY:
                            rec.status = "Incomplete Workday(IWD)"
                        else:
                            rec.status = "Half Day"
                        
                        self.stdout.write(f"   - Calculated: {rec.hours} work, {rec.extra_hours} overtime. Status: {rec.status}")
                except Exception as e:
                    self.stdout.write(f"   - Failed to calculate hours: {e}")
                    # Keep status as "Complete (Auto)"
                
                # 3. Find employee email
                emp_id = str(rec.employee_id).strip()
                user = User.objects.filter(Q(username__iexact=emp_id) | Q(email__iexact=emp_id)).first()
                if not user:
                    # Try finding via Profile model mapping
                    profile = Profile.objects.filter(employee_id__iexact=emp_id).first()
                    if profile:
                        user = profile.user
                
                if user and user.email:
                    self.stdout.write(f"   - Sending warning email to {user.email}...")
                    success = self.send_warning_email(user, rec.date)
                    if success:
                        self.stdout.write(f"   - Email sent successfully.")
                    else:
                        self.stdout.write(f"   - FAILED to send email (Check GOOGLE_SCRIPT_URL or Quotas).")
                else:
                    reason = "No user found" if not user else "User has no email"
                    self.stdout.write(f"   - Skipping email: {reason} for ID {emp_id}")

                rec.save()
                count += 1
            except Exception as e:
                self.stderr.write(f"CRITICAL ERROR processing record {rec.id}: {str(e)}")
                # Continue to next record

        self.stdout.write(self.style.SUCCESS(f'Successfully processed {count} out of {hanging.count()} hanging sessions.'))

    def send_warning_email(self, user, date):
        subject = f"Attendance Auto-Logout Warning: {date}"
        # Use first name if available
        first_name = user.first_name or user.username
        body = (
            f"Hello {first_name},\n\n"
            f"This is an automated notification from Brolly Solutions Attendance System.\n\n"
            f"It was detected that you did not clock out or sync your session for {date}. "
            f"As per system policy, your session has been automatically closed at 11:59 PM.\n\n"
            f"IMPORTANT: Always remember to 'Sync to Cloud' before leaving to ensure your working hours are accurately recorded.\n\n"
            f"If this happened by mistake, please contact HR/Admin to adjust your hours.\n\n"
            f"Regards,\n"
            f"Brolly Solutions Team"
        )

        script_url = getattr(settings, 'GOOGLE_SCRIPT_URL', None)
        if not script_url:
            self.stdout.write("   - Error: GOOGLE_SCRIPT_URL not configured.")
            return False

        try:
            r = requests.post(
                script_url,
                data=json.dumps({
                    "action": "sendEmail",
                    "to": user.email,
                    "subject": subject,
                    "body": body
                }),
                headers={"Content-Type": "text/plain"},
                allow_redirects=True,
                timeout=15
            )
            return r.status_code == 200
        except Exception as e:
            self.stderr.write(f"   - Email request exception: {str(e)}")
            return False


