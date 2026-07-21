"""Shared employee-sync logic.

The Google Sheet is the source of truth for the employee roster. The Django DB
mirrors it so backend features (reminders, profiles, tasks, sessions) have a
`User` row per employee.

Both the `/sync-users/` endpoint (admin "Sync" button) and the server-side
automatic sync funnel through `reconcile_employees()` so the create / update /
reactivate / soft-delete behaviour is identical no matter how it is triggered.
"""

import json
import logging

import requests
from django.conf import settings
from django.contrib.auth.models import User

from .models import Profile

logger = logging.getLogger(__name__)


def reconcile_employees(users_data):
    """Reconcile the Django user roster against a FULL employee list.

    - Creates users that are new to the DB.
    - Reactivates users that reappear in the list.
    - Soft-deletes (is_active=False) users no longer in the list.
    - Never touches staff / superuser accounts.

    `users_data` MUST be the complete current roster (full-list reconcile).
    A partial list would incorrectly deactivate everyone missing from it, so
    guardrails below refuse to deactivate on an empty or all-wiping payload.

    Returns a summary dict.
    """
    created_count = 0
    updated_count = 0
    reactivated_count = 0

    # Usernames present in this payload — the survivors of the reconcile.
    sheet_usernames = set()

    for user_item in users_data:
        if not isinstance(user_item, dict):
            continue

        # Prioritize email field if it exists, otherwise construct one
        username = user_item.get('username') or user_item.get('id')
        email = user_item.get('email') or (f"{username}@example.com" if username else None)
        password = user_item.get('password')

        if not username:
            continue

        sheet_usernames.add(username)

        try:
            user, created = User.objects.get_or_create(username=username)
            if created or not user.email:
                user.email = email

            # An employee that reappears in the sheet after being removed
            # should be reactivated so they can log in / receive reminders again.
            if not user.is_active:
                user.is_active = True
                reactivated_count += 1

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

    # --- Reconcile deletions (soft delete) ---
    deactivated_count = 0
    deactivated_users = []
    skipped_reconcile = False

    if not sheet_usernames:
        skipped_reconcile = True
        logger.warning(
            "reconcile_employees: empty payload — skipping deactivation to avoid mass-lockout"
        )
    else:
        stale_users = User.objects.filter(is_active=True).exclude(
            username__in=sheet_usernames
        ).exclude(is_staff=True).exclude(is_superuser=True)

        stale_count = stale_users.count()
        active_total = User.objects.filter(
            is_active=True, is_staff=False, is_superuser=False
        ).count()

        # Guardrail: never let one sync deactivate the entire active roster
        # (e.g. the sheet was accidentally cleared or the fetch was truncated).
        if active_total > 0 and stale_count >= active_total:
            skipped_reconcile = True
            logger.warning(
                "reconcile_employees: payload would deactivate ALL %s active "
                "employees — skipping as a safety guardrail", active_total
            )
        else:
            for user in stale_users:
                user.is_active = False
                user.save(update_fields=['is_active'])
                deactivated_count += 1
                deactivated_users.append(user.username)
            if deactivated_users:
                logger.info(
                    "reconcile_employees: deactivated removed employees: %s",
                    deactivated_users,
                )

    return {
        "created": created_count,
        "updated": updated_count,
        "reactivated": reactivated_count,
        "deactivated": deactivated_count,
        "deactivated_users": deactivated_users,
        "reconcile_skipped": skipped_reconcile,
    }


def fetch_sheet_employees():
    """GET the full employee roster from the Google Apps Script sheet endpoint.

    Returns a list of dicts with lowercased keys (id/name/username/email/...),
    or None if the sheet could not be fetched or returned nothing usable.
    """
    script_url = getattr(settings, 'GOOGLE_SCRIPT_URL', None)
    if not script_url:
        logger.warning("fetch_sheet_employees: GOOGLE_SCRIPT_URL not configured")
        return None

    try:
        resp = requests.get(script_url, timeout=20, allow_redirects=True)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"fetch_sheet_employees: failed to fetch sheet: {e}")
        return None

    if not isinstance(data, list) or not data:
        logger.warning("fetch_sheet_employees: sheet returned no rows")
        return None

    normalized = []
    for row in data:
        if not isinstance(row, dict):
            continue
        obj = {}
        for k, v in row.items():
            obj[str(k).strip().lower()] = ("" if v is None else str(v).strip())
        normalized.append(obj)
    return normalized


def sync_from_sheet():
    """Pull the roster from the sheet and reconcile the DB. Best-effort.

    Returns the reconcile summary dict, or None if the sheet was unavailable
    (in which case the DB is left untouched — never reconcile against nothing).
    """
    employees = fetch_sheet_employees()
    if not employees:
        return None
    summary = reconcile_employees(employees)
    logger.info("sync_from_sheet: %s", json.dumps(summary))
    return summary
