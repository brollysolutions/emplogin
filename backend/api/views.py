from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Attendance, PasswordResetToken, Task, Profile, LeaveRequest, ChatMessage, EmployeeGroup, Holiday, EmployeeSession
import secrets
from .serializers import (
    AttendanceSerializer, TaskSerializer, ProfileSerializer, 
    LeaveRequestSerializer, ChatMessageSerializer, EmployeeGroupSerializer, HolidaySerializer
)
import uuid
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q
from django.db import transaction
import os
import requests
import json
from django.core.management import call_command
import logging
from .tasks import run_async
from datetime import datetime as _dt

logger = logging.getLogger(__name__)

# Unique timestamp set once when this Django process starts.
# A new server start produces a new value, allowing the frontend
# to detect restarts and force employees to re-login.
SERVER_START_TIME = _dt.utcnow().isoformat() + "Z"


@api_view(['GET'])
def health_check(request):
    # This version string should be updated manually or via CI/CD on every deploy
    # Current Version: 2.1.2 (Pulse Implementation)
    return Response({
        "status": "ok",
        "version": "2.1.2",
        "message": "System is running smoothly",
        "server_start_time": SERVER_START_TIME,
    }, status=status.HTTP_200_OK)

# Session lifetime: an employee must re-authenticate after this many hours.
SESSION_DURATION_HOURS = 12


@api_view(['POST'])
def create_session(request):
    """Register a server-side session after the client has matched credentials.

    Returns a token that every device validates. Fail-soft by design: if this
    call fails the client still logs in locally, but cross-device logout/expiry
    only works once a session is registered here.
    """
    employee_id = str(request.data.get('employee_id', '')).strip()
    if not employee_id:
        return Response({"error": "employee_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    name = str(request.data.get('employee_name', '')).strip()[:255]
    device = str(request.data.get('device_label', '')).strip()[:255]
    token = secrets.token_urlsafe(32)
    expires = timezone.now() + timedelta(hours=SESSION_DURATION_HOURS)

    EmployeeSession.objects.create(
        token=token,
        employee_id=employee_id,
        employee_name=name,
        device_label=device,
        expires_at=expires,
    )
    return Response({
        "token": token,
        "expires_at": expires.isoformat(),
        "server_time": timezone.now().isoformat(),
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def validate_session(request, token):
    """Polled by every device. Returns valid=False if the session was revoked
    (logout on another device) or has expired, so the device can log itself out."""
    try:
        s = EmployeeSession.objects.get(token=token)
    except EmployeeSession.DoesNotExist:
        return Response({"valid": False, "reason": "not_found"}, status=status.HTTP_200_OK)

    now = timezone.now()
    valid = s.is_active and s.expires_at > now
    if valid:
        # Touch last_seen so admins can see active devices; auto_now handles it.
        s.save(update_fields=["last_seen"])

    return Response({
        "valid": valid,
        "reason": None if valid else ("expired" if s.is_active else "revoked"),
        "expires_at": s.expires_at.isoformat(),
        "remaining_seconds": max(0, int((s.expires_at - now).total_seconds())),
        "server_time": now.isoformat(),
        "employee_id": s.employee_id,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
def logout_session(request, token):
    """Revoke a session. Pass {"all": true} to revoke EVERY active session for
    that employee so all of their devices are logged out on the next poll."""
    revoke_all = str(request.data.get('all', '')).lower() in ('1', 'true', 'yes')
    try:
        s = EmployeeSession.objects.get(token=token)
    except EmployeeSession.DoesNotExist:
        # Already gone — treat as success so the client can finish logging out.
        return Response({"success": True, "already": True}, status=status.HTTP_200_OK)

    if revoke_all:
        EmployeeSession.objects.filter(employee_id=s.employee_id, is_active=True).update(is_active=False)
    else:
        s.is_active = False
        s.save(update_fields=["is_active"])
    return Response({"success": True}, status=status.HTTP_200_OK)


def send_email_reliably(to, subject, body):
    """Send one email through whichever channel actually works in this environment.

    Cloud hosts almost always block outbound SMTP (port 465/587), so Django's
    send_mail() silently fails in production even though it works on a dev laptop.
    Google Apps Script delivers over HTTPS (port 443), which is never blocked —
    this is the same channel the password-reset email already uses successfully.

    Order: Google Apps Script first (if GOOGLE_SCRIPT_URL is configured), then
    fall back to SMTP for local dev where GAS may not be set up.

    Returns (ok: bool, channel: str, detail: str).
    """
    script_url = getattr(settings, 'GOOGLE_SCRIPT_URL', '') or ''

    # 1) Preferred: Google Apps Script over HTTPS (works on the cloud).
    if script_url:
        try:
            resp = requests.post(
                script_url,
                data=json.dumps({
                    "action": "sendEmail",
                    "to": to,
                    "subject": subject,
                    "body": body,
                }),
                headers={"Content-Type": "text/plain"},
                allow_redirects=True,  # Apps Script 302-redirects the POST
                timeout=15,
            )
            try:
                gs_json = resp.json()
                if gs_json.get("success"):
                    return True, "google_script", "sent"
                detail = f"Apps Script error: {gs_json}"
            except Exception:
                if resp.status_code == 200:
                    return True, "google_script", "sent"
                detail = f"Apps Script returned {resp.status_code}: {resp.text[:200]}"
            logger.error(f"GAS email to {to} failed: {detail}")
        except Exception as e:
            detail = f"GAS request failed: {e}"
            logger.error(f"GAS email to {to} raised: {e}", exc_info=True)
    else:
        detail = "GOOGLE_SCRIPT_URL not configured"

    # 2) Fallback: SMTP (works locally; usually blocked on the cloud).
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
        return True, "smtp", "sent"
    except Exception as e:
        logger.error(f"SMTP email to {to} failed: {e}")
        return False, "none", f"{detail}; SMTP also failed: {e}"


@api_view(['POST'])
def send_test_reminder(request):
    """
    Triggers a single test reminder. Sends via Google Apps Script (HTTPS) so it
    works on the cloud where outbound SMTP is blocked; falls back to SMTP locally.
    """
    email = request.data.get('email')
    if not email:
        return Response({"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST)

    name = request.data.get('name', 'Test User')
    subject = "Test Reminder: Brolly Attendance System"
    body = (
        f"Good Morning {name}!\n\n"
        f"This is a TEST reminder from Brolly Solutions Attendance System.\n\n"
        f"The scheduled login time is 10:00 AM. Please make sure to log in on time.\n\n"
        f"Regards,\n"
        f"Brolly Solutions Team"
    )

    ok, channel, detail = send_email_reliably(email, subject, body)
    if ok:
        return Response({"success": f"Test reminder sent to {email} via {channel}"})
    return Response(
        {"error": f"Failed to send test reminder: {detail}"},
        status=status.HTTP_502_BAD_GATEWAY,
    )

def _trigger_auto_logout_if_needed():
    """
    Checks if the auto_logout command has been run today.
    If not, runs it asynchronously in the background using the managed thread pool.
    """
    last_run_file = os.path.join(settings.BASE_DIR, '.auto_logout_last_run')
    today_str = timezone.localtime(timezone.now()).strftime('%Y-%m-%d')
    
    should_run = True
    if os.path.exists(last_run_file):
        try:
            with open(last_run_file, 'r') as f:
                last_run_content = f.read().strip()
                if last_run_content.startswith(today_str):
                    should_run = False
        except Exception as e:
            logger.error(f"Failed to read auto logout last run file: {e}")
            
    if should_run:
        try:
            with open(last_run_file, 'w') as f:
                f.write(timezone.now().isoformat())
        except Exception as e:
            logger.error(f"Failed to write auto logout last run file: {e}")
            
        def run_command_bg():
            try:
                logger.info("Starting background auto_logout task.")
                call_command('auto_logout')
                logger.info("Background auto_logout task completed.")
            except Exception as e:
                logger.error(f"Background auto_logout task failed: {e}", exc_info=True)
                
        run_async(run_command_bg)


def _trigger_morning_reminders_if_needed():
    """
    Checks if reminders have been triggered today.
    If not, runs the send_reminders command asynchronously.
    """
    now = timezone.localtime(timezone.now())
    if now.weekday() == 6:  # Sunday
        return
        
    current_time_str = now.strftime('%H:%M')
    if current_time_str < "09:25":
        return

    today_str = now.strftime('%Y-%m-%d')
    trigger_lock = os.path.join(settings.BASE_DIR, f'.reminders_triggered_{today_str}')
    
    if not os.path.exists(trigger_lock):
        try:
            with open(trigger_lock, 'w') as f:
                f.write(timezone.now().isoformat())
        except Exception as e:
            logger.error(f"Failed to write reminders trigger lock file: {e}")
            return
            
        def run_command_bg():
            try:
                logger.info("Starting background send_reminders task.")
                call_command('send_reminders')
                logger.info("Background send_reminders task completed.")
            except Exception as e:
                logger.error(f"Background send_reminders task failed: {e}", exc_info=True)
                
        run_async(run_command_bg)


@api_view(['GET', 'POST'])
def attendance_list(request):
    try:
        if request.method == 'GET':
            _trigger_auto_logout_if_needed()
            _trigger_morning_reminders_if_needed()
            attendances = Attendance.objects.all().order_by('-date', '-timestamp')
            data = []
            for r in attendances:
                data.append({
                    "id": r.employee_id,
                    "name": r.name,
                    "dept": r.dept,
                    "date": r.date,
                    "logint": r.login_time,
                    "logoutt": r.logout_time,
                    "hours": r.hours,
                    "extrahours": r.extra_hours,
                    "tasks": r.tasks,
                    "break_time": r.total_break_time,
                    "break_logs": r.break_logs,
                    "offline_logs": r.offline_logs,
                    "status": r.status,
                    "last_status_change": r.last_status_change,
                    "last_active": r.last_active,
                    "screenshot": request.build_absolute_uri(r.screenshot.url) if r.screenshot else None
                })
            return Response(data)

        elif request.method == 'POST':
            employee_id = request.data.get('id')
            date = request.data.get('date')
            
            if not employee_id or not date:
                return Response({"error": "Missing employee ID or date"}, status=status.HTTP_400_BAD_REQUEST)

            instance = Attendance.objects.filter(employee_id=employee_id, date=date).first()
            
            if instance:
                # Directly overwrite tasks from incoming request to allow full editing, deleting, and updating
                incoming_tasks = request.data.get('tasks')
                if incoming_tasks is not None:
                    instance.tasks = incoming_tasks.strip()

                # Safeguard: If the existing record is already in a completed state,
                # do not let a stale/late client request set it back to an active state
                # or clear the logout time.
                completed_statuses = ['Complete (Auto)']
                new_status = request.data.get('status')
                
                if instance.status in completed_statuses and new_status in ['Active', 'On Break', 'working', 'break']:
                    logger.warning(f"Prevented stale update from resetting completed record {instance.id} (Status: {instance.status}) for employee {employee_id} on {date}")
                    if 'screenshot' in request.FILES:
                        instance.screenshot = request.FILES['screenshot']
                else:
                    # Update fields normally
                    instance.login_time = request.data.get('loginT', instance.login_time)
                    instance.logout_time = request.data.get('logoutT', instance.logout_time)

                    # ── Guard against a stale/late client (a second tab, another
                    #    device, or an out-of-order request) pushing a SMALLER hours
                    #    or break value onto an active day, which would make the
                    #    counter visibly tick backwards. Accumulated worked time on a
                    #    live day only ever grows, so keep whichever value is larger.
                    incoming_hours = request.data.get('hours', instance.hours)
                    incoming_break = request.data.get('breakTime', instance.total_break_time)
                    active_session = (instance.status in ['Active', 'On Break']) or \
                                     (new_status in ['Active', 'On Break'])
                    if active_session:
                        cur_h, inc_h = hms_to_seconds(instance.hours), hms_to_seconds(incoming_hours)
                        if cur_h is not None and inc_h is not None and inc_h < cur_h:
                            logger.warning(
                                f"Ignored backward hours update for {employee_id} on {date}: "
                                f"{incoming_hours} < {instance.hours}"
                            )
                            incoming_hours = instance.hours
                        cur_b, inc_b = hms_to_seconds(instance.total_break_time), hms_to_seconds(incoming_break)
                        if cur_b is not None and inc_b is not None and inc_b < cur_b:
                            incoming_break = instance.total_break_time

                    instance.hours = incoming_hours
                    instance.total_break_time = incoming_break
                    instance.break_logs = request.data.get('breakLogs', instance.break_logs)
                    instance.extra_hours = request.data.get('extraHours', instance.extra_hours)
                    instance.status = request.data.get('status', instance.status)
                    instance.last_status_change = request.data.get('lastStatusChange', instance.last_status_change)
                    instance.last_active = timezone.now()
                    if 'screenshot' in request.FILES:
                        instance.screenshot = request.FILES['screenshot']
                
                # Check for 8-hour completion
                if not instance.eight_hour_notified:
                    h_str = instance.hours
                    if h_str and h_str != "—":
                        try:
                            parts = h_str.split(':')
                            if len(parts) >= 2:
                                hours_val = int(parts[0])
                                if hours_val >= 8:
                                    # Send email in background
                                    def send_completion_email(user_obj, emp_name):
                                        subject = "Congratulations! Day Goal Completed"
                                        body = (
                                            f"Hello {emp_name},\n\n"
                                            f"Great job! You have completed 8 hours of work for today ({date}).\n"
                                            f"Your dedication is appreciated. Have a wonderful rest of your day!\n\n"
                                            f"Best Regards,\n"
                                            f"Brolly Solutions Team"
                                        )
                                        try:
                                            send_mail(
                                                subject,
                                                body,
                                                settings.DEFAULT_FROM_EMAIL,
                                                [user_obj.email],
                                                fail_silently=False,
                                            )
                                        except: pass

                                    # Find user
                                    user = User.objects.filter(Q(username__iexact=employee_id) | Q(email__iexact=employee_id)).first()
                                    if not user:
                                        profile = Profile.objects.filter(employee_id__iexact=employee_id).first()
                                        if profile: user = profile.user
                                    
                                    if user and user.email:
                                        logger.info(f"Submitting 8-hour completion email task for {user.email}")
                                        instance.eight_hour_notified = True
                                        def send_completion_email_with_log(user_obj, emp_name):
                                            try:
                                                send_completion_email(user_obj, emp_name)
                                                logger.info(f"8-hour email sent successfully to {user_obj.email}")
                                            except Exception as e:
                                                logger.error(f"Failed to send 8-hour email: {e}")
                                        run_async(send_completion_email_with_log, user, instance.name)
                                    else:
                                        logger.debug(f"User or email not found for ID {employee_id}, cannot send 8-hour email")
                        except Exception as e:
                            logger.error(f"8-hour check failed for {employee_id}: {e}")

                instance.save()
                return Response({"message": "Record updated"}, status=status.HTTP_200_OK)
            else:
                # Create (same logic as before)
                st = request.data.get('status') or "Active"
                new_record = Attendance(
                    employee_id=employee_id,
                    name=request.data.get('name', 'Unknown'),
                    dept=request.data.get('dept', 'Unknown'),
                    date=date,
                    login_time=request.data.get('loginT', '—'),
                    logout_time=request.data.get('logoutT', '—'),
                    hours=request.data.get('hours', '—'),
                    total_break_time=request.data.get('breakTime', '00:00:00'),
                    break_logs=request.data.get('breakLogs', '[]'),
                    extra_hours=request.data.get('extraHours', '—'),
                    tasks=request.data.get('tasks', '—'),
                    status=st,
                    last_status_change=request.data.get('lastStatusChange'),
                    last_active=timezone.now(),
                    screenshot=request.FILES.get('screenshot')
                )
                new_record.save()
                return Response({"message": "Record saved"}, status=status.HTTP_201_CREATED)
    except Exception as e:
        logger.error(f"ERROR in attendance_list: {str(e)}", exc_info=True)
        return Response({"error": "An internal server error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def request_password_reset(request):
    try:
        email = request.data.get('email')
        if not email:
            return Response({"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Search by email OR username safely
            user = User.objects.filter(Q(email=email) | Q(username=email)).first()

            if not user:
                # To avoid email enumeration, still return a success message
                return Response({"message": "If this account exists in our system, a reset link has been sent."}, status=status.HTTP_200_OK)

            target_email = user.email
            if not target_email:
                return Response({"error": f"Account '{email}' found, but it has no email address associated with it."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Database error in request_password_reset: {str(e)}", exc_info=True)
            return Response({"error": "A database error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        token = str(uuid.uuid4())
        PasswordResetToken.objects.create(email=target_email, username=user.username, token=token)

        # # # Build the reset link - Updated to /test_login/ for testing environment
        # origin = request.headers.get('Origin', 'https://brollysolutions.in')
        # reset_link = f"{origin}/login/?token={token}"

        # Build the reset link - Updated to /login/ for testing environment
        origin = request.headers.get('Origin', 'https://brollysolutions.in')
        reset_link = f"{origin}/login/?token={token}"

        subject = "Password Reset Request - Brolly Solutions"
        body = (
            f"Hello {user.username},\n\n"
            f"You requested a password reset for your Brolly Solutions portal account.\n\n"
            f"Click the link below to set a new password:\n\n{reset_link}\n\n"
            f"This link expires in 1 hour.\n\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"— Brolly Solutions Team"
        )

        # Send via Google Apps Script (uses HTTPS port 443, never blocked)
        script_url = settings.GOOGLE_SCRIPT_URL
        if not script_url:
            return Response({"error": "GOOGLE_SCRIPT_URL is not configured in .env"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            gs_response = requests.post(
                script_url,
                data=json.dumps({
                    "action": "sendEmail",
                    "to": target_email,
                    "subject": subject,
                    "body": body
                }),
                headers={"Content-Type": "text/plain"},
                allow_redirects=True,
                timeout=15
            )
            print(f"DEBUG GAS email: status={gs_response.status_code} body={gs_response.text}")

            # Google Apps Script returns 200 even on errors sometimes, check the body
            try:
                gs_json = gs_response.json()
                if gs_json.get("success"):
                    return Response({"message": "Password reset link sent to your email."}, status=status.HTTP_200_OK)
                else:
                    return Response({"error": f"Script error: {gs_json}"}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                # If response isn't JSON, treat 200 as success
                if gs_response.status_code == 200:
                    return Response({"message": "Password reset link sent to your email."}, status=status.HTTP_200_OK)
                return Response({"error": f"Script returned: {gs_response.text}"}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error(f"ERROR calling Google Script in request_password_reset: {str(e)}", exc_info=True)
            return Response({"error": "Failed to send reset email via external service."}, status=status.HTTP_502_BAD_GATEWAY)

    except Exception as e:
        logger.error(f"System Error in request_password_reset: {str(e)}", exc_info=True)
        return Response({"error": "A system error occurred. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
def reset_password(request):
    token = request.data.get('token')
    new_password = request.data.get('password')
    
    if not token or not new_password:
        return Response({"error": "Token and password are required"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        reset_token = PasswordResetToken.objects.get(token=token, is_used=False)
        # Check if token is expired (e.g., 1 hour)
        if timezone.now() > reset_token.created_at + timedelta(hours=1):
            return Response({"error": "Token has expired"}, status=status.HTTP_400_BAD_REQUEST)
        
        if reset_token.username:
            user = User.objects.get(username=reset_token.username)
        else:
            # Fallback for older tokens or edge cases
            user = User.objects.filter(email=reset_token.email).first()
        
        if not user:
            return Response({"error": "User associated with this token not found"}, status=status.HTTP_404_NOT_FOUND)
        user.set_password(new_password)
        user.save()
        
        # Sync to Google Sheets
        if settings.GOOGLE_SCRIPT_URL:
            gs_payload = {
                "action": "updatePassword",
                "id": user.username,
                "email": user.email,
                "password": new_password
            }
            print(f"DEBUG Google Sync: Sending to {settings.GOOGLE_SCRIPT_URL}")
            print(f"DEBUG Google Sync: Payload = {gs_payload}")
            try:
                gs_response = requests.post(
                    settings.GOOGLE_SCRIPT_URL,
                    data=json.dumps(gs_payload),
                    headers={"Content-Type": "text/plain"},
                    allow_redirects=True  # CRITICAL: Google Script redirects the POST request
                )
                print(f"DEBUG Google Sync: Status Code = {gs_response.status_code}")
                print(f"DEBUG Google Sync: Response = {gs_response.text}")
            except Exception as e:
                print(f"ERROR Google Sync failed: {e}")
        else:
            print("WARNING: GOOGLE_SCRIPT_URL is not set in .env — skipping sheet sync")

        reset_token.is_used = True
        reset_token.save()
        
        return Response({"message": "Password has been reset successfully."}, status=status.HTTP_200_OK)
    except PasswordResetToken.DoesNotExist:
        return Response({"error": "Invalid or used token"}, status=status.HTTP_400_BAD_REQUEST)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
def sync_users(request):
    users_data = request.data.get('users')
    if not isinstance(users_data, list):
        return Response({"error": "Invalid payload format. Expected a list of users."}, status=status.HTTP_400_BAD_REQUEST)

    created_count = 0
    updated_count = 0
    
    for user_item in users_data:
        if not isinstance(user_item, dict):
            continue

        # Prioritize email field if it exists, otherwise construct one
        username = user_item.get('username') or user_item.get('id')
        email = user_item.get('email') or (f"{username}@example.com" if username else None)
        password = user_item.get('password')
        
        if not username: continue
        
        try:
            user, created = User.objects.get_or_create(username=username)
            if created or not user.email:
                user.email = email
                
            # Ensure Profile exists
            profile, p_created = Profile.objects.get_or_create(user=user)
            if p_created or not profile.employee_id:
                profile.employee_id = username
            profile.save()
                
            # Only set password on creation to avoid overwriting current passwords
            if created and password:
                user.set_password(password)
                created_count += 1
            else:
                updated_count += 1
            user.save()
        except Exception as e:
            logger.error(f"Failed to sync user {username}: {e}")
            continue
            
    return Response({
        "message": f"Sync complete. Created {created_count}, Updated {updated_count} users.",
        "success": True
    }, status=status.HTTP_200_OK)

@api_view(['GET', 'POST'])
def task_list(request):
    if request.method == 'GET':
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            tasks = Task.objects.filter(employee_id=employee_id).order_by('-assigned_at')
        else:
            tasks = Task.objects.all().order_by('-assigned_at')
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        serializer = TaskSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PATCH'])
def update_task_status(request, pk):
    try:
        task = Task.objects.get(pk=pk)
    except Task.DoesNotExist:
        return Response({"error": "Task not found"}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get('status')
    if new_status == 'Viewed' and task.status == 'Assigned':
        task.status = 'Viewed'
        task.viewed_at = timezone.now()
    elif new_status == 'Completed':
        task.status = 'Completed'
        task.completed_at = timezone.now()
    
    task.save()
    serializer = TaskSerializer(task)
    return Response(serializer.data)

@api_view(['GET', 'POST'])
def leave_request_list(request):
    if request.method == 'GET':
        employee_id = request.query_params.get('employee_id')
        if employee_id:
            # Employee viewing their requests
            requests_list = LeaveRequest.objects.filter(employee_id=employee_id).order_by('-applied_at')
        else:
            # Admin viewing all requests
            requests_list = LeaveRequest.objects.all().order_by('-applied_at')
        
        serializer = LeaveRequestSerializer(requests_list, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        # Employee submitting a request
        employee_id = request.data.get('employee_id')
        start_date = request.data.get('start_date')
        end_date = request.data.get('end_date')

        if not employee_id or not start_date or not end_date:
            return Response({"error": "Missing required fields"}, status=status.HTTP_400_BAD_REQUEST)

        # Check for overlaps with existing Pending or Approved requests
        # Logic: (StartA <= EndB) and (EndA >= StartB)
        overlapping = LeaveRequest.objects.filter(
            employee_id=employee_id,
            status__in=['Pending', 'Approved'],
            start_date__lte=end_date,
            end_date__gte=start_date
        ).exists()

        if overlapping:
            return Response(
                {"error": "You already have a pending or approved request overlapping with these dates."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = LeaveRequestSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PATCH', 'DELETE'])
def leave_request_detail(request, pk):
    try:
        leave = LeaveRequest.objects.get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({"error": "Leave request not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = LeaveRequestSerializer(leave)
        return Response(serializer.data)

    elif request.method == 'PATCH':
        if leave.status != 'Pending':
            return Response({"error": "Only pending requests can be modified"}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = LeaveRequestSerializer(leave, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        if leave.status != 'Pending':
            return Response({"error": "Only pending requests can be deleted"}, status=status.HTTP_400_BAD_REQUEST)
        leave.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['PATCH'])
@transaction.atomic
def approve_leave(request, pk):
    try:
        # Use select_for_update to lock the leave request record
        leave = LeaveRequest.objects.select_for_update().get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({"error": "Leave request not found"}, status=status.HTTP_404_NOT_FOUND)

    status_val = request.data.get('status')
    admin_comment = request.data.get('admin_comment', '')

    if status_val not in ['Approved', 'Rejected']:
        return Response({"error": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST)

    if leave.status == 'Pending' and status_val == 'Approved':
        # Decrement leave count only if it is not a WFH request
        if leave.leave_type != 'Work From Home':
            try:
                # Lock the profile record if it exists
                profile = Profile.objects.select_for_update().filter(employee_id__iexact=leave.employee_id).first()

                if not profile:
                    # Fallback 1: find user by employee_id as username or email
                    user = User.objects.filter(
                        Q(username__iexact=leave.employee_id) | Q(email__iexact=leave.employee_id)
                    ).first()

                    if not user:
                        # Fallback 2: find user by employee name
                        user = User.objects.filter(username__iexact=leave.employee_name).first()

                    if user:
                        # User exists but profile is missing — create profile safely
                        profile, _ = Profile.objects.get_or_create(user=user)
                        profile.employee_id = leave.employee_id
                        profile.save()
                    else:
                        # No User at all — auto-create User + Profile safely
                        # We use get_or_create for User to avoid race conditions if two threads reach here
                        user, created = User.objects.get_or_create(
                            username=leave.employee_id,
                            defaults={
                                'first_name': leave.employee_name.split()[0] if leave.employee_name else "",
                                'last_name': " ".join(leave.employee_name.split()[1:]) if leave.employee_name else "",
                            }
                        )
                        if created:
                            user.set_password(leave.employee_id)
                            user.save()
                        
                        profile, _ = Profile.objects.get_or_create(
                            user=user,
                            defaults={
                                'employee_id': leave.employee_id,
                                'total_leaves': 16
                            }
                        )

                # Deduct leave days from balance (EXCLUDING SUNDAYS)
                leave_days = sum(
                    1 for i in range((leave.end_date - leave.start_date).days + 1)
                    if (leave.start_date + timedelta(days=i)).weekday() != 6  # 6 = Sunday
                )
                profile.total_leaves -= leave_days
                profile.save()

            except Exception as e:
                # Log error but still approve the leave — never block admin action
                logger.error(f"Profile processing error for {leave.employee_id} in approve_leave: {str(e)}", exc_info=True)


    leave.status = status_val
    leave.admin_comment = admin_comment
    leave.reviewed_at = timezone.now()
    leave.is_notified = False # Reset notification for employee to see
    leave.save()

    serializer = LeaveRequestSerializer(leave)
    return Response(serializer.data)

@api_view(['GET', 'PATCH'])
def employee_profile(request, employee_id):
    # Try to find profile with case-insensitive employee_id
    profile = Profile.objects.filter(employee_id__iexact=employee_id).first()
    
    if not profile:
        # Auto-create if user exists but profile was not created yet
        user = User.objects.filter(username__iexact=employee_id).first()
        if not user:
            # If the user doesn't exist, we auto-create the User + Profile on the fly
            # Fetch name from their Attendance  to pre-populate User
            name = ""
            attendance = Attendance.objects.filter(employee_id__iexact=employee_id).exclude(name='').order_by('-timestamp').first()
            if attendance and attendance.name and attendance.name != '—':
                name = attendance.name
                
            name_parts = name.split()
            first_name = name_parts[0] if len(name_parts) > 0 else ""
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
            
            try:
                user = User.objects.create_user(
                    username=employee_id,
                    email=f"{employee_id}@example.com",
                    password=employee_id,  # Default password = employee_id
                    first_name=first_name,
                    last_name=last_name
                )
                logger.info(f"Auto-created User '{employee_id}' from profile request")
            except Exception as e:
                # Fallback if username already exists in another case, try to fetch it
                user = User.objects.filter(username__iexact=employee_id).first()
                if not user:
                    logger.error(f"Failed to create user {employee_id}: {str(e)}", exc_info=True)
                    return Response({"error": "Failed to initialize employee account."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    
        # Now get or create the profile for the user
        profile, created = Profile.objects.get_or_create(user=user)
        try:
            profile.employee_id = employee_id
            profile.save()
            logger.info(f"Linked profile for user '{user.username}' with employee_id '{employee_id}'")
        except Exception as e:
            logger.error(f"Failed to save profile with employee_id '{employee_id}': {e}", exc_info=True)
            # If a unique constraint failure occurred because another user has this ID, resolve safely
            existing_profile = Profile.objects.filter(employee_id__iexact=employee_id).first()
            if existing_profile:
                profile = existing_profile
            else:
                return Response({"error": "Profile linking failed due to a system conflict."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if request.method == 'GET':
        serializer = ProfileSerializer(profile, context={'request': request})
        return Response(serializer.data)
        
    elif request.method == 'PATCH':
        serializer = ProfileSerializer(profile, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PATCH'])
def mark_notification_read(request, pk):
    try:
        leave = LeaveRequest.objects.get(pk=pk)
        leave.is_notified = True
        leave.save()
        return Response({"success": True})
    except LeaveRequest.DoesNotExist:
        return Response({"error": "Leave request not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
def profile_list(request):
    profiles = Profile.objects.all()
    serializer = ProfileSerializer(profiles, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET', 'POST'])
def message_list(request):
    if request.method == 'GET':
        user1 = request.query_params.get('user1')
        user2 = request.query_params.get('user2')
        group_id = request.query_params.get('group_id')
        
        if group_id:
            messages = ChatMessage.objects.filter(group_id=group_id).order_by('timestamp')
        elif not user1:
            return Response({"error": "user1 or group_id query param is required"}, status=status.HTTP_400_BAD_REQUEST)
        elif user2:
            # Conversation between two specific users
            messages = ChatMessage.objects.filter(
                (Q(sender_id=user1) & Q(receiver_id=user2)) |
                (Q(sender_id=user2) & Q(receiver_id=user1))
            ).order_by('timestamp')
        else:
            # All messages for user1 (including groups they belong to)
            user_obj = User.objects.filter(username=user1).first()
            if user_obj:
                if user1 == 'admin' or user_obj.is_staff:
                    # Admins/Staff see all group messages + their direct messages
                    messages = ChatMessage.objects.filter(
                        Q(sender_id=user1) | Q(receiver_id=user1) | Q(group_id__startswith='group_')
                    ).order_by('timestamp')
                else:
                    # Regular employees only see groups they are members of
                    member_groups = user_obj.employee_groups.all()
                    group_tags = [f"group_{g.id}" for g in member_groups]
                    
                    messages = ChatMessage.objects.filter(
                        Q(sender_id=user1) | Q(receiver_id=user1) | Q(group_id__in=group_tags)
                    ).order_by('timestamp')
            else:
                messages = ChatMessage.objects.filter(
                    Q(sender_id=user1) | Q(receiver_id=user1)
                ).order_by('timestamp')
            
        serializer = ChatMessageSerializer(messages, many=True, context={'request': request})
        return Response(serializer.data)

    elif request.method == 'POST':
        serializer = ChatMessageSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PATCH'])
def mark_messages_read(request):
    sender_id = request.data.get('sender_id')
    receiver_id = request.data.get('receiver_id')
    
    if not sender_id or not receiver_id:
        return Response({"error": "sender_id and receiver_id are required"}, status=status.HTTP_400_BAD_REQUEST)
        
    ChatMessage.objects.filter(
        sender_id=sender_id,
        receiver_id=receiver_id,
        is_read=False
    ).update(is_read=True)
    
    return Response({"success": True})

@api_view(['GET', 'POST'])
def group_list(request):
    if request.method == 'GET':
        groups = EmployeeGroup.objects.all()
        serializer = EmployeeGroupSerializer(groups, many=True)
        return Response(serializer.data)
    elif request.method == 'POST':
        # name, description, members (list of IDs)
        serializer = EmployeeGroupSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PATCH', 'DELETE'])
def group_detail(request, pk):
    try:
        group = EmployeeGroup.objects.get(pk=pk)
    except EmployeeGroup.DoesNotExist:
        return Response({"error": "Group not found"}, status=status.HTTP_404_NOT_FOUND)
        
    if request.method == 'DELETE':
        group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
        
    elif request.method == 'PATCH':
        serializer = EmployeeGroupSerializer(group, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def group_membership(request, pk):
    try:
        group = EmployeeGroup.objects.get(pk=pk)
    except EmployeeGroup.DoesNotExist:
        return Response({"error": "Group not found"}, status=status.HTTP_404_NOT_FOUND)
        
    action = request.data.get('action') # 'add' or 'remove'
    user_id = request.data.get('user_id')
    employee_id = request.data.get('employee_id')
    
    if not user_id and not employee_id:
        return Response({"error": "user_id or employee_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        
    try:
        if user_id:
            user = User.objects.get(id=user_id)
        else:
            try:
                user = User.objects.get(username=employee_id)
            except User.DoesNotExist:
                # Auto-create user if they exist in our employee list (Admin is adding them)
                user = User.objects.create_user(username=employee_id, password=employee_id)
                profile, _ = Profile.objects.get_or_create(user=user)
                profile.employee_id = employee_id
                profile.save()
            
        if action == 'add':
            group.members.add(user)
        elif action == 'remove':
            group.members.remove(user)
        else:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({"success": True, "member_count": group.members.count()})
    except Exception as e:
        return Response({"error": f"Failed to update membership: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


def format_seconds_to_hms(secs):
    h = int(secs // 3600)
    m = int((secs % 3600) // 60)
    s = int(secs % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"

def hms_to_seconds(value):
    """Parse an 'HH:MM:SS' string to seconds. Returns None for blanks/'—'/garbage."""
    if not value or value == "—":
        return None
    try:
        parts = str(value).split(':')
        parts = [int(p) for p in parts]
        while len(parts) < 3:
            parts.insert(0, 0)
        h, m, s = parts[-3], parts[-2], parts[-1]
        return h * 3600 + m * 60 + s
    except (ValueError, TypeError):
        return None

@api_view(['POST'])
def heartbeat(request):
    employee_id = request.data.get('employee_id')
    if not employee_id:
        return Response({"error": "Missing employee_id"}, status=status.HTTP_400_BAD_REQUEST)
    
    date = request.data.get('date')
    now = timezone.now()
    
    # Fetch the record to check for gaps
    if date:
        record = Attendance.objects.filter(employee_id=employee_id, date=date).first()
    else:
        record = Attendance.objects.filter(employee_id=employee_id).order_by('-date', '-timestamp').first()

    if record:
        # Check for offline gaps (e.g., if last_active was more than 1 hour ago)
        # Threshold 3600s = 1 hour (previously 600s)
        if record.last_active:
            gap = (now - record.last_active).total_seconds()
            if gap > 3600:
                try:
                    logs = json.loads(record.offline_logs or "[]")
                    logs.append({
                        "start": timezone.localtime(record.last_active).strftime('%I:%M:%S %p'),
                        "end": timezone.localtime(now).strftime('%I:%M:%S %p'),
                        "duration": format_seconds_to_hms(gap)
                    })
                    record.offline_logs = json.dumps(logs)
                except Exception as e:
                    logger.error(f"Failed to update offline logs: {e}")

        record.last_active = now
        record.save()
            
    return Response({"success": True, "server_start_time": SERVER_START_TIME})


@api_view(['GET'])
def chat_summaries(request):
    """Returns the last message and timestamp for all conversations involving the admin."""
    # This is an expensive operation if many messages exist; in production, use a dedicated summary table.
    employees = ChatMessage.objects.values('sender_id', 'receiver_id').distinct()
    ids = set()
    for e in employees:
        if e['sender_id'] != 'admin': ids.add(e['sender_id'])
        if e['receiver_id'] != 'admin': ids.add(e['receiver_id'])
    
    results = {}
    for eid in ids:
        last_msg = ChatMessage.objects.filter(
            (Q(sender_id='admin') & Q(receiver_id=eid)) |
            (Q(sender_id=eid) & Q(receiver_id='admin'))
        ).order_by('-timestamp').first()
        
        if last_msg:
            results[eid] = {
                "last_message": last_msg.content,
                "timestamp": last_msg.timestamp,
                "is_read": last_msg.is_read if last_msg.receiver_id == 'admin' else True
            }
            
    return Response(results)


@api_view(['GET', 'POST'])
def holiday_list(request):
    if request.method == 'GET':
        holidays = Holiday.objects.all().order_by('date')
        serializer = HolidaySerializer(holidays, many=True)
        return Response(serializer.data)
    elif request.method == 'POST':
        serializer = HolidaySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
def holiday_detail(request, pk):
    try:
        holiday = Holiday.objects.get(pk=pk)
    except Holiday.DoesNotExist:
        return Response({"error": "Holiday not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'DELETE':
        holiday.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
