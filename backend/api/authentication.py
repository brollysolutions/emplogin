"""Token authentication over the existing EmployeeSession model.

Clients authenticate by sending the token issued by `/api/v1/login/`:

    Authorization: Bearer <token>

This deliberately reuses `EmployeeSession` instead of adding a second token
model. That session already carries expiry and a revoke flag that every device
polls, so a token revoked anywhere (logout, expiry, logout-all) stops working
everywhere at once — which is the guarantee the session model was built for.

DRF's split is followed throughout: `request.user` answers *who*, and
`request.auth` holds the `EmployeeSession` that proved it. Views should read the
employee id from the session via `session_employee_id(request)` rather than from
the request body, so a caller cannot act as another employee.
"""

import logging

from django.contrib.auth.models import User
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission

from .models import EmployeeSession, Profile

logger = logging.getLogger(__name__)

# employee_id stamped on admin sessions. Admins are not sheet employees, so they
# have no employee row of their own.
ADMIN_EMPLOYEE_ID = "admin"


class SessionIdentity:
    """Stand-in for `request.user` when a valid session has no Django `User` row.

    Sessions are created at login, while `User` rows are mirrored from the
    Google Sheet by `reconcile_employees()`. The mirror can lag, and admin
    sessions have no user row at all — neither should make a valid token fail to
    authenticate, so DRF gets this duck-typed identity instead of a `User`.

    Only the attributes DRF and the permission classes actually touch are
    implemented; it is not a `User` substitute for ORM use.
    """

    is_active = True
    is_staff = False
    is_superuser = False

    def __init__(self, employee_id, username="", is_admin=False):
        self.employee_id = employee_id
        self.username = username or employee_id
        self.is_admin = is_admin

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def __str__(self):
        return self.username


class EmployeeSessionAuthentication(BaseAuthentication):
    """Authenticate a request from its `Authorization: Bearer <token>` header.

    Returns `None` when no bearer token is present, which leaves the request
    anonymous and lets endpoint permissions decide. An invalid, expired or
    revoked token is an explicit failure — a client sending a dead token needs
    to be told so it can log itself out, not silently treated as anonymous.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        token = self._get_token(request)
        if not token:
            return None

        try:
            session = EmployeeSession.objects.get(token=token)
        except EmployeeSession.DoesNotExist:
            raise AuthenticationFailed("Invalid session token.")

        if not session.is_valid():
            # Mirrors the reasons validate_session reports, so a client can tell
            # "signed out on another device" from "session ended".
            reason = "expired" if session.is_active else "revoked"
            raise AuthenticationFailed(f"Session {reason}.")

        # Touch last_seen (auto_now) so admins can see live devices — the same
        # single-column write validate_session already does on every poll.
        session.save(update_fields=["last_seen"])

        return (self._resolve_user(session), session)

    def authenticate_header(self, request):
        # Returning a value here makes DRF answer 401 rather than 403 when
        # credentials are missing, which is what clients need to trigger a login.
        return self.keyword

    def _get_token(self, request):
        header = get_authorization_header(request).split()
        if not header or header[0].lower() != self.keyword.lower().encode():
            return None
        if len(header) != 2:
            raise AuthenticationFailed(
                "Malformed Authorization header. Expected 'Bearer <token>'."
            )
        try:
            return header[1].decode()
        except UnicodeError:
            raise AuthenticationFailed("Invalid token encoding.")

    def _resolve_user(self, session):
        """Prefer the real Django user so `request.user.profile` works downstream."""
        if session.is_admin:
            return SessionIdentity(ADMIN_EMPLOYEE_ID, "admin", is_admin=True)

        profile = (
            Profile.objects.select_related("user")
            .filter(sheet_employee_id__iexact=session.employee_id)
            .first()
            or Profile.objects.select_related("user")
            .filter(employee_id__iexact=session.employee_id)
            .first()
        )
        if profile and profile.user.is_active:
            return profile.user

        user = User.objects.filter(
            username__iexact=session.employee_id, is_active=True
        ).first()
        if user:
            return user

        # Valid session, no mirrored user yet. Authenticate on the session alone.
        logger.info(
            "Session %s has no active User row for employee_id %r; "
            "authenticating on the session alone",
            session.pk,
            session.employee_id,
        )
        return SessionIdentity(session.employee_id, session.employee_name)


def session_employee_id(request):
    """The authenticated employee_id, or `None` if the request is anonymous.

    Views must prefer this over `request.data['employee_id']`: the body is
    caller-controlled, so trusting it lets anyone read or write another
    employee's records.
    """
    session = getattr(request, "auth", None)
    return getattr(session, "employee_id", None) if session is not None else None


def is_admin_request(request):
    """True when the request carries an admin session."""
    session = getattr(request, "auth", None)
    return bool(session is not None and getattr(session, "is_admin", False))


class IsAdminSession(BasePermission):
    """Allow only admin sessions.

    For endpoints that act across the whole company — leave approvals, the
    profile roster, group management, roster sync.
    """

    message = "Administrator access is required."

    def has_permission(self, request, view):
        return is_admin_request(request)


class IsAuthenticatedSession(BasePermission):
    """Allow any valid session, employee or admin."""

    message = "A valid session is required."

    def has_permission(self, request, view):
        return getattr(request, "auth", None) is not None
