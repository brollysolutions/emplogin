"""
Endpoint test suite — one or more tests for EVERY API endpoint.

Run all:            python manage.py test api
Run one class:      python manage.py test api.tests.AttendanceEndpointTests
Verbose:            python manage.py test api -v 2

These tests hit the URLconf directly through Django's test client (a throwaway
in-memory test DB), so they prove the *view logic* is correct independent of
Nginx / the cloud proxy. To check whether the SAME endpoints are reachable once
deployed behind Nginx, use the live checker in backend/smoke_test.py instead.

Email/external calls are neutralised: the email backend is overridden to an
in-memory one, and GOOGLE_SCRIPT_URL is left empty so no real network call is
made.
"""

from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Attendance,
    ChatMessage,
    EmployeeGroup,
    EmployeeSession,
    Holiday,
    LeaveRequest,
    PasswordResetToken,
    Profile,
    Task,
)

# Use an in-memory email backend so no test ever tries to reach a real SMTP server.
LOCMEM_EMAIL = override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"
)

API = "/api/v1"


class BaseAPITestCase(APITestCase):
    """Shared fixtures used across the endpoint tests."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="BG000169",
            email="emp169@example.com",
            password="password123",
            first_name="Test",
            last_name="Employee",
        )
        self.profile = Profile.objects.create(user=self.user, employee_id="BG000169")
        self.group = EmployeeGroup.objects.create(name="Engineering", description="Devs")


# ─────────────────────────────────────────────────────────────────────────────
# health/
# ─────────────────────────────────────────────────────────────────────────────
class HealthEndpointTests(BaseAPITestCase):
    def test_health_returns_ok(self):
        r = self.client.get(f"{API}/health/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["status"], "ok")

    def test_health_rejects_post(self):
        r = self.client.post(f"{API}/health/")
        self.assertEqual(r.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


# ─────────────────────────────────────────────────────────────────────────────
# sessions/  +  sessions/<token>/  +  sessions/<token>/logout/
# ─────────────────────────────────────────────────────────────────────────────
class SessionEndpointTests(BaseAPITestCase):
    def test_create_session_requires_employee_id(self):
        r = self.client.post(f"{API}/sessions/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_session_success(self):
        r = self.client.post(
            f"{API}/sessions/",
            {"employee_id": "BG000169", "employee_name": "Test Employee"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", r.data)
        self.assertTrue(EmployeeSession.objects.filter(token=r.data["token"]).exists())

    def test_validate_unknown_token_returns_valid_false(self):
        r = self.client.get(f"{API}/sessions/does-not-exist/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(r.data["valid"])

    def test_validate_active_token(self):
        s = EmployeeSession.objects.create(
            token="tok-active",
            employee_id="BG000169",
            expires_at=timezone.now() + timedelta(hours=1),
        )
        r = self.client.get(f"{API}/sessions/{s.token}/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data["valid"])

    def test_logout_revokes_session(self):
        s = EmployeeSession.objects.create(
            token="tok-logout",
            employee_id="BG000169",
            expires_at=timezone.now() + timedelta(hours=1),
        )
        r = self.client.post(f"{API}/sessions/{s.token}/logout/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        s.refresh_from_db()
        self.assertFalse(s.is_active)

    def test_logout_unknown_token_is_idempotent(self):
        r = self.client.post(f"{API}/sessions/ghost/logout/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(r.data["success"])


# ─────────────────────────────────────────────────────────────────────────────
# attendance/
# ─────────────────────────────────────────────────────────────────────────────
class AttendanceEndpointTests(BaseAPITestCase):
    @patch("api.views._trigger_morning_reminders_if_needed", lambda: None)
    @patch("api.views._trigger_auto_logout_if_needed", lambda: None)
    def test_list_returns_records(self):
        Attendance.objects.create(
            employee_id="BG000169",
            name="Test Employee",
            dept="Eng",
            date="06 Jul 2026",
            login_time="10:00:00 AM",
            status="Active",
        )
        r = self.client.get(f"{API}/attendance/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(len(r.data), 1)

    def test_post_requires_id_and_date(self):
        r = self.client.post(f"{API}/attendance/", {"id": "BG000169"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_creates_new_record(self):
        r = self.client.post(
            f"{API}/attendance/",
            {
                "id": "BG000169",
                "date": "06 Jul 2026",
                "name": "Test Employee",
                "dept": "Eng",
                "loginT": "10:00:00 AM",
                "status": "Active",
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Attendance.objects.filter(employee_id="BG000169").exists())

    def test_post_updates_existing_and_never_goes_backward(self):
        Attendance.objects.create(
            employee_id="BG000169",
            name="Test Employee",
            dept="Eng",
            date="06 Jul 2026",
            login_time="10:00:00 AM",
            hours="05:00:00",
            status="Active",
        )
        # Client tries to push a SMALLER hours value on an active day — must be ignored.
        r = self.client.post(
            f"{API}/attendance/",
            {"id": "BG000169", "date": "06 Jul 2026", "hours": "02:00:00", "status": "Active"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        rec = Attendance.objects.get(employee_id="BG000169", date="06 Jul 2026")
        self.assertEqual(rec.hours, "05:00:00")  # kept the larger value


# ─────────────────────────────────────────────────────────────────────────────
# forgot-password/  +  reset-password/
# ─────────────────────────────────────────────────────────────────────────────
class PasswordEndpointTests(BaseAPITestCase):
    def test_forgot_password_requires_email(self):
        r = self.client.post(f"{API}/forgot-password/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_forgot_password_unknown_user_does_not_leak(self):
        # Enumeration protection: unknown address still returns 200.
        r = self.client.post(
            f"{API}/forgot-password/", {"email": "nobody@example.com"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_reset_password_requires_token_and_password(self):
        r = self.client.post(f"{API}/reset-password/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_password_rejects_invalid_token(self):
        r = self.client.post(
            f"{API}/reset-password/",
            {"token": "bad", "password": "newpass123"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(GOOGLE_SCRIPT_URL="")  # never hit the real Google Script from a test
    def test_reset_password_success(self):
        prt = PasswordResetToken.objects.create(
            email=self.user.email, username=self.user.username, token="valid-token"
        )
        r = self.client.post(
            f"{API}/reset-password/",
            {"token": prt.token, "password": "brandNewPass1"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("brandNewPass1"))


# ─────────────────────────────────────────────────────────────────────────────
# sync-users/
# ─────────────────────────────────────────────────────────────────────────────
class SyncUsersEndpointTests(BaseAPITestCase):
    def test_rejects_non_list_payload(self):
        r = self.client.post(f"{API}/sync-users/", {"users": "notalist"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_creates_new_user(self):
        r = self.client.post(
            f"{API}/sync-users/",
            {"users": [{"username": "BG000200", "password": "pw", "email": "e@x.com"}]},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(User.objects.filter(username="BG000200").exists())


# ─────────────────────────────────────────────────────────────────────────────
# tasks/  +  tasks/<pk>/
# ─────────────────────────────────────────────────────────────────────────────
class TaskEndpointTests(BaseAPITestCase):
    def test_list_tasks(self):
        r = self.client.get(f"{API}/tasks/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_create_task(self):
        r = self.client.post(
            f"{API}/tasks/",
            {"employee_id": "BG000169", "title": "Do X", "description": "details"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_create_task_invalid(self):
        r = self.client.post(f"{API}/tasks/", {"title": "no employee"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_task_status(self):
        task = Task.objects.create(
            employee_id="BG000169", title="T", description="d", status="Assigned"
        )
        r = self.client.patch(
            f"{API}/tasks/{task.id}/", {"status": "Completed"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, "Completed")

    def test_update_missing_task_404(self):
        r = self.client.patch(f"{API}/tasks/999999/", {"status": "Viewed"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)


# ─────────────────────────────────────────────────────────────────────────────
# leaves/  +  leaves/<pk>/  +  leaves/<pk>/approve/  +  leaves/<pk>/notify/
# ─────────────────────────────────────────────────────────────────────────────
class LeaveEndpointTests(BaseAPITestCase):
    def _make_leave(self, status_val="Pending"):
        return LeaveRequest.objects.create(
            employee_id="BG000169",
            employee_name="Test Employee",
            leave_type="Casual Leave",
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 2),
            reason="Trip",
            status=status_val,
        )

    def test_list_leaves(self):
        r = self.client.get(f"{API}/leaves/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_create_leave_missing_fields(self):
        r = self.client.post(f"{API}/leaves/", {"employee_id": "BG000169"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_leave_success(self):
        r = self.client.post(
            f"{API}/leaves/",
            {
                "employee_id": "BG000169",
                "employee_name": "Test Employee",
                "leave_type": "Casual Leave",
                "start_date": "2026-09-01",
                "end_date": "2026-09-02",
                "reason": "Family",
            },
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_leave_detail_get(self):
        leave = self._make_leave()
        r = self.client.get(f"{API}/leaves/{leave.id}/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_leave_detail_missing_404(self):
        r = self.client.get(f"{API}/leaves/999999/")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_leave_delete_pending(self):
        leave = self._make_leave()
        r = self.client.delete(f"{API}/leaves/{leave.id}/")
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)

    def test_approve_leave(self):
        leave = self._make_leave()
        r = self.client.patch(
            f"{API}/leaves/{leave.id}/approve/",
            {"status": "Approved", "admin_comment": "ok"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        leave.refresh_from_db()
        self.assertEqual(leave.status, "Approved")

    def test_approve_leave_invalid_status(self):
        leave = self._make_leave()
        r = self.client.patch(
            f"{API}/leaves/{leave.id}/approve/", {"status": "Maybe"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_notify_marks_read(self):
        leave = self._make_leave()
        r = self.client.patch(f"{API}/leaves/{leave.id}/notify/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        leave.refresh_from_db()
        self.assertTrue(leave.is_notified)


# ─────────────────────────────────────────────────────────────────────────────
# profiles/  +  profile/<employee_id>/
# ─────────────────────────────────────────────────────────────────────────────
class ProfileEndpointTests(BaseAPITestCase):
    def test_profile_list(self):
        r = self.client.get(f"{API}/profiles/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_get_existing_profile(self):
        r = self.client.get(f"{API}/profile/BG000169/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(r.data["employee_id"], "BG000169")

    def test_patch_profile(self):
        r = self.client.patch(
            f"{API}/profile/BG000169/", {"contact": "9998887776"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.contact, "9998887776")

    def test_get_unknown_profile_autocreates(self):
        # Documented behaviour: GET on an unknown id auto-provisions the account.
        r = self.client.get(f"{API}/profile/BG000999/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertTrue(User.objects.filter(username="BG000999").exists())


# ─────────────────────────────────────────────────────────────────────────────
# messages/  +  messages/read/
# ─────────────────────────────────────────────────────────────────────────────
class MessageEndpointTests(BaseAPITestCase):
    def test_list_requires_user_or_group(self):
        r = self.client.get(f"{API}/messages/")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_conversation(self):
        ChatMessage.objects.create(sender_id="admin", receiver_id="BG000169", content="hi")
        r = self.client.get(f"{API}/messages/", {"user1": "admin", "user2": "BG000169"})
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(len(r.data), 1)

    def test_send_message(self):
        r = self.client.post(
            f"{API}/messages/",
            {"sender_id": "admin", "receiver_id": "BG000169", "content": "hello"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_mark_messages_read_requires_ids(self):
        r = self.client.patch(f"{API}/messages/read/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mark_messages_read(self):
        ChatMessage.objects.create(
            sender_id="BG000169", receiver_id="admin", content="unread", is_read=False
        )
        r = self.client.patch(
            f"{API}/messages/read/",
            {"sender_id": "BG000169", "receiver_id": "admin"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertFalse(ChatMessage.objects.filter(is_read=False).exists())


# ─────────────────────────────────────────────────────────────────────────────
# groups/  +  groups/<pk>/  +  groups/<pk>/membership/
# ─────────────────────────────────────────────────────────────────────────────
class GroupEndpointTests(BaseAPITestCase):
    def test_list_groups(self):
        r = self.client.get(f"{API}/groups/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_create_group(self):
        r = self.client.post(f"{API}/groups/", {"name": "Sales"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_patch_group(self):
        r = self.client.patch(
            f"{API}/groups/{self.group.id}/", {"description": "updated"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_delete_group(self):
        r = self.client.delete(f"{API}/groups/{self.group.id}/")
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)

    def test_group_missing_404(self):
        r = self.client.patch(f"{API}/groups/999999/", {"name": "x"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)

    def test_membership_add(self):
        r = self.client.post(
            f"{API}/groups/{self.group.id}/membership/",
            {"action": "add", "employee_id": "BG000169"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        self.assertEqual(self.group.members.count(), 1)

    def test_membership_requires_id(self):
        r = self.client.post(
            f"{API}/groups/{self.group.id}/membership/", {"action": "add"}, format="json"
        )
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────────────────────────────────────
# heartbeat/
# ─────────────────────────────────────────────────────────────────────────────
class HeartbeatEndpointTests(BaseAPITestCase):
    def test_heartbeat_requires_employee_id(self):
        r = self.client.post(f"{API}/heartbeat/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_heartbeat_updates_last_active(self):
        rec = Attendance.objects.create(
            employee_id="BG000169",
            name="Test Employee",
            dept="Eng",
            date="06 Jul 2026",
            login_time="10:00:00 AM",
            status="Active",
        )
        r = self.client.post(
            f"{API}/heartbeat/",
            {"employee_id": "BG000169", "date": "06 Jul 2026"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)
        rec.refresh_from_db()
        self.assertIsNotNone(rec.last_active)


# ─────────────────────────────────────────────────────────────────────────────
# chat-summaries/
# ─────────────────────────────────────────────────────────────────────────────
class ChatSummariesEndpointTests(BaseAPITestCase):
    def test_chat_summaries(self):
        ChatMessage.objects.create(sender_id="admin", receiver_id="BG000169", content="hi")
        r = self.client.get(f"{API}/chat-summaries/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# test-reminder/
# ─────────────────────────────────────────────────────────────────────────────
@LOCMEM_EMAIL
@override_settings(GOOGLE_SCRIPT_URL="")  # force the local SMTP path; never hit the network
class TestReminderEndpointTests(BaseAPITestCase):
    def test_requires_email(self):
        r = self.client.post(f"{API}/test-reminder/", {}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sends_reminder(self):
        r = self.client.post(
            f"{API}/test-reminder/",
            {"email": "someone@example.com", "name": "Someone"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# holidays/  +  holidays/<pk>/
# ─────────────────────────────────────────────────────────────────────────────
class HolidayEndpointTests(BaseAPITestCase):
    def test_list_holidays(self):
        r = self.client.get(f"{API}/holidays/")
        self.assertEqual(r.status_code, status.HTTP_200_OK)

    def test_create_holiday(self):
        r = self.client.post(
            f"{API}/holidays/",
            {"date": "2026-12-25", "name": "Christmas"},
            format="json",
        )
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)

    def test_create_holiday_invalid(self):
        r = self.client.post(f"{API}/holidays/", {"name": "no date"}, format="json")
        self.assertEqual(r.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_holiday(self):
        h = Holiday.objects.create(date=date(2026, 1, 1), name="New Year")
        r = self.client.delete(f"{API}/holidays/{h.id}/")
        self.assertEqual(r.status_code, status.HTTP_204_NO_CONTENT)

    def test_delete_missing_holiday_404(self):
        r = self.client.delete(f"{API}/holidays/999999/")
        self.assertEqual(r.status_code, status.HTTP_404_NOT_FOUND)
