from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Attendance, PasswordResetToken
from .serializers import AttendanceSerializer
import uuid
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q
import requests
import json

@api_view(['GET'])
def health_check(request):
    return Response({"status": "ok", "message": "VERSION 2.0 - PICKING UP CHANGES"}, status=status.HTTP_200_OK)

@api_view(['GET', 'POST'])
def attendance_list(request):
    try:
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
                    "last_status_change": r.last_status_change
                })
            return Response(data)

        elif request.method == 'POST':
            employee_id = request.data.get('id')
            date = request.data.get('date')
            
            if not employee_id or not date:
                return Response({"error": "Missing employee ID or date"}, status=status.HTTP_400_BAD_REQUEST)

            # Use .filter().first() to avoid MultipleObjectsReturned error (500)
            instance = Attendance.objects.filter(employee_id=employee_id, date=date).first()
            
            if instance:
                # Update cumulative fields
                instance.login_time = request.data.get('loginT', instance.login_time)
                instance.logout_time = request.data.get('logoutT', instance.logout_time)
                instance.hours = request.data.get('hours', instance.hours)
                instance.total_break_time = request.data.get('breakTime', instance.total_break_time)
                instance.extra_hours = request.data.get('extraHours', instance.extra_hours)
                instance.tasks = request.data.get('tasks', instance.tasks)
                instance.status = request.data.get('status', instance.status)
                instance.last_status_change = request.data.get('lastStatusChange', instance.last_status_change)
                instance.save()
                return Response({"message": "Record updated"}, status=status.HTTP_200_OK)
            else:
                # Create
                # Ensure status is not None to avoid NOT NULL constraint error
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
                    last_status_change=request.data.get('lastStatusChange')
                )
                new_record.save()
                return Response({"message": "Record saved"}, status=status.HTTP_201_CREATED)
    except Exception as e:
        import traceback
        print(f"ERROR in attendance_list: {str(e)}")
        print(traceback.format_exc())
        return Response({"error": str(e), "traceback": traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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

        # Build the reset link
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
