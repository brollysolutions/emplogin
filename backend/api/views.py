from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Attendance, PasswordResetToken, Task, Profile, LeaveRequest, ChatMessage, EmployeeGroup
from .serializers import (
    AttendanceSerializer, TaskSerializer, ProfileSerializer, 
    LeaveRequestSerializer, ChatMessageSerializer, EmployeeGroupSerializer
)
import uuid
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q
import os
import requests
import json
from django.core.management import call_command
import threading


@api_view(['GET'])
def health_check(request):
    # This version string should be updated manually or via CI/CD on every deploy
    # Current Version: 2.1.2 (Pulse Implementation)
    return Response({
        "status": "ok", 
        "version": "2.1.2",
        "message": "System is running smoothly"
    }, status=status.HTTP_200_OK)

@api_view(['GET', 'POST'])
def attendance_list(request):
    try:
        # Proactive cleanup and reminders
        def run_background_tasks():
            try:
                now = timezone.now()
                # Check for aware vs naive if necessary, though timezone.now() is usually aware
                
                # 1. Trigger Auto-Logout (Every hour)
                last_logout_file = os.path.join(settings.BASE_DIR, '.auto_logout_last_run')
                run_logout = True
                if os.path.exists(last_logout_file):
                    with open(last_logout_file, 'r') as f:
                        last_run_str = f.read().strip()
                        if last_run_str:
                            last_run = timezone.datetime.fromisoformat(last_run_str)
                            if timezone.is_aware(now) and not timezone.is_aware(last_run):
                                last_run = timezone.make_aware(last_run)
                            if now - last_run < timedelta(hours=1):
                                run_logout = False
                
                if run_logout:
                    with open(last_logout_file, 'w') as f:
                        f.write(now.isoformat())
                    call_command('auto_logout')

                # 2. Trigger Morning Reminders (Check if it's 9:30 AM window)
                # The command itself handles Sunday and "already sent" logic
                call_command('send_reminders')

            except Exception as e:
                print(f"Background task failed: {e}")

        # Run in a separate thread
        threading.Thread(target=run_background_tasks).start()



        if request.method == 'GET':
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
                # Update fields
                instance.login_time = request.data.get('loginT', instance.login_time)
                instance.logout_time = request.data.get('logoutT', instance.logout_time)
                instance.hours = request.data.get('hours', instance.hours)
                instance.total_break_time = request.data.get('breakTime', instance.total_break_time)
                instance.extra_hours = request.data.get('extraHours', instance.extra_hours)
                instance.tasks = request.data.get('tasks', instance.tasks)
                instance.status = request.data.get('status', instance.status)
                instance.last_status_change = request.data.get('lastStatusChange', instance.last_status_change)
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
                                        script_url = settings.GOOGLE_SCRIPT_URL
                                        if script_url:
                                            try:
                                                requests.post(script_url, data=json.dumps({
                                                    "action": "sendEmail",
                                                    "to": user_obj.email,
                                                    "subject": subject,
                                                    "body": body
                                                }), headers={"Content-Type": "text/plain"}, timeout=10)
                                            except: pass

                                    # Find user
                                    user = User.objects.filter(Q(username__iexact=employee_id) | Q(email__iexact=employee_id)).first()
                                    if not user:
                                        profile = Profile.objects.filter(employee_id__iexact=employee_id).first()
                                        if profile: user = profile.user
                                    
                                    if user and user.email:
                                        print(f"DEBUG: Sending 8-hour completion email to {user.email}")
                                        instance.eight_hour_notified = True
                                        def send_completion_email_with_log(user_obj, emp_name):
                                            try:
                                                send_completion_email(user_obj, emp_name)
                                                print(f"DEBUG: 8-hour email sent successfully to {user_obj.email}")
                                            except Exception as e:
                                                print(f"ERROR: Failed to send 8-hour email: {e}")
                                        threading.Thread(target=send_completion_email_with_log, args=(user, instance.name)).start()
                                    else:
                                        print(f"DEBUG: User or email not found for ID {employee_id}, cannot send 8-hour email")
                        except Exception as e:
                            print(f"DEBUG: 8-hour check failed for {employee_id}: {e}")

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
                    extra_hours=request.data.get('extraHours', '—'),
                    tasks=request.data.get('tasks', '—'),
                    status=st,
                    last_status_change=request.data.get('lastStatusChange'),
                    screenshot=request.FILES.get('screenshot')
                )
                new_record.save()
                return Response({"message": "Record saved"}, status=status.HTTP_201_CREATED)
    except Exception as e:
        import traceback
        print(f"ERROR in attendance_list: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
            import traceback
            return Response({"error": f"Database error: {str(e)}", "traceback": traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        token = str(uuid.uuid4())
        PasswordResetToken.objects.create(email=target_email, username=user.username, token=token)

        # Build the reset link - Updated to /test_login/ for testing environment
        origin = request.headers.get('Origin', 'https://brollysolutions.in')
        reset_link = f"{origin}/test_login/?token={token}"

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
            print(f"ERROR calling Google Script: {str(e)}")
            return Response({"error": f"Failed to call email script: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

    except Exception as e:
        import traceback
        return Response({"error": f"System Error: {str(e)}", "traceback": traceback.format_exc()}, status=status.HTTP_400_BAD_REQUEST)

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
    users_data = request.data.get('users', [])
    created_count = 0
    updated_count = 0
    
    for user_item in users_data:
        # Prioritize email field if it exists, otherwise construct one
        email = user_item.get('email')
        username = user_item.get('username') or user_item.get('id')
        password = user_item.get('password')
        
        if not username: continue
        if not email: email = f"{username}@example.com"
        
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
        serializer = LeaveRequestSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['PATCH'])
def approve_leave(request, pk):
    try:
        leave = LeaveRequest.objects.get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({"error": "Leave request not found"}, status=status.HTTP_404_NOT_FOUND)

    status_val = request.data.get('status')
    admin_comment = request.data.get('admin_comment', '')

    if status_val not in ['Approved', 'Rejected']:
        return Response({"error": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST)

    if leave.status == 'Pending' and status_val == 'Approved':
        # Decrement leave count
        try:
            profile = Profile.objects.filter(employee_id__iexact=leave.employee_id).first()
            if not profile:
                # Fallback: try to find user by username or email
                user = User.objects.filter(Q(username__iexact=leave.employee_id) | Q(email__iexact=leave.employee_id)).first()
                if user:
                    profile, _ = Profile.objects.get_or_create(user=user)
                    profile.employee_id = leave.employee_id
                    profile.save()
                else:
                    # Final attempt: search Profiles by user username
                    user_alt = User.objects.filter(username__iexact=leave.employee_name).first()
                    if user_alt:
                         profile, _ = Profile.objects.get_or_create(user=user_alt)
                         profile.employee_id = leave.employee_id
                         profile.save()
                    else:
                        return Response({"error": f"Employee profile for {leave.employee_id} not found and could not be auto-created."}, status=status.HTTP_404_NOT_FOUND)

            
            # Calculate duration (inclusive)
            leave_days = (leave.end_date - leave.start_date).days + 1
            
            # Deduct leaves regardless of current balance (Admin has full discretion)
            profile.total_leaves -= leave_days
            profile.save()
        except Exception as e:
            return Response({"error": f"Profile processing error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    leave.status = status_val
    leave.admin_comment = admin_comment
    leave.reviewed_at = timezone.now()
    leave.is_notified = False # Reset notification for employee to see
    leave.save()

    serializer = LeaveRequestSerializer(leave)
    return Response(serializer.data)

@api_view(['GET'])
def employee_profile(request, employee_id):
    try:
        profile = Profile.objects.get(employee_id=employee_id)
        serializer = ProfileSerializer(profile)
        return Response(serializer.data)
    except Profile.DoesNotExist:
        return Response({"error": "Profile not found"}, status=status.HTTP_404_NOT_FOUND)

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
    serializer = ProfileSerializer(profiles, many=True)
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


@api_view(['POST'])
def heartbeat(request):
    employee_id = request.data.get('employee_id')
    if not employee_id:
        return Response({"error": "Missing employee_id"}, status=status.HTTP_400_BAD_REQUEST)
    
    # Try current date first
    date = request.data.get('date')
    updated = 0
    if date:
        updated = Attendance.objects.filter(employee_id=employee_id, date=date).update(last_active=timezone.now())
    
    if not updated:
        # Update the absolute latest record for this user
        latest = Attendance.objects.filter(employee_id=employee_id).order_by('-date', '-timestamp').first()
        if latest:
            latest.last_active = timezone.now()
            latest.save()
            
    return Response({"success": True})


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
