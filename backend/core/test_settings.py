"""Settings used only by the Playwright end-to-end suite.

Points Django at a throwaway SQLite file so a test run can never touch
db.sqlite3, and severs every outbound integration (SMTP, the Google Apps
Script roster) so a test run cannot mail a real employee or mutate the
real sheet.
"""

import os

from .settings import *  # noqa: F401,F403

DEBUG = True

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.e2e.sqlite3",  # noqa: F405
        "OPTIONS": {"timeout": 20},
    }
}

# Mail goes to an in-memory outbox; nothing leaves the machine.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# The roster endpoint. Empty by default, which makes fetch_sheet_employees()
# and sync_from_sheet() no-ops so nothing calls Google.
#
# The Playwright suite sets E2E_SHEET_URL to the local stub in e2e/stub_sheet.py
# so the sheet-verification branch of login_view is actually exercised — with an
# unreachable sheet, a wrong password returns 503 ("cannot verify") instead of
# the 401 it returns in production, and that branch would never be covered.
# Only a 127.0.0.1 URL is accepted, so a stray environment variable can never
# point a test run at the real Apps Script.
GOOGLE_SCRIPT_URL = os.environ.get("E2E_SHEET_URL", "")  # noqa: F405
if GOOGLE_SCRIPT_URL and not GOOGLE_SCRIPT_URL.startswith(
    ("http://127.0.0.1", "http://localhost")
):
    raise RuntimeError(
        f"E2E_SHEET_URL must point at a local stub, got {GOOGLE_SCRIPT_URL!r}. "
        "Refusing to run the test suite against a remote roster."
    )

ADMIN_USERNAME = "brolly@admin"
ADMIN_PASSWORD = "Brolly@pass"

CORS_ALLOW_ALL_ORIGINS = True
