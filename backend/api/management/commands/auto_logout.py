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
        
        hanging = Attendance.objects.exclude(date=today_str).filter(
            status__in=['Active', 'On Break', 'working', 'break', 'Login']
        )
        
        count = 0
        self.stdout.write(f"Searching for hanging sessions (not {today_str})...")
        
        for rec in hanging:
            self.stdout.write(f"Closing hanging session for {rec.name} on {rec.date} (Status: {rec.status})")
            
            # 1. Update status
            original_status = rec.status
            rec.logout_time = "11:59:59 PM"
            rec.status = "Complete (Auto)"
            
            # 2. Find employee email
            user = User.objects.filter(Q(username__iexact=rec.employee_id) | Q(email__iexact=rec.employee_id)).first()
            if not user:
                # Try finding via Profile model mapping
                profile = Profile.objects.filter(employee_id__iexact=rec.employee_id).first()
                if profile:
                    user = profile.user
            
            if user and user.email:
                success = self.send_warning_email(user, rec.date)
                if success:
                    self.stdout.write(f"Warning email sent to {user.email}")
                else:
                    self.stdout.write(f"FAILED to send warning email to {user.email}")
            else:
                self.stdout.write(f"Warning: No email found for user {rec.employee_id}")

            rec.save()
            count += 1

            
        self.stdout.write(self.style.SUCCESS(f'Successfully auto-logged out {count} users.'))

    def send_warning_email(self, user, date):
        subject = f"Attendance Auto-Logout Warning: {date}"
        body = (
            f"Hello {user.username},\n\n"
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
            return

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
            self.stderr.write(f"Failed to send email to {user.email}: {str(e)}")
            return False

