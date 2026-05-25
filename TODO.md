# Project Audit & TODOs
# Project Audit & TODOs

## Critical Severity (Security & Stability)
- [x] **Hardcoded Secrets & Settings**: `backend/core/settings.py` contains a hardcoded `SECRET_KEY`, `DEBUG = True`, and `CORS_ALLOW_ALL_ORIGINS = True`. These must be moved to environment variables for production safety. (DONE: Refactored to use `os.environ.get`)
- [x] **Unsafe User Sync**: The `/api/v1/sync_users/` endpoint processes bulk user creation from frontend payloads. Ensure payload validation is hardened since this directly creates Django `User` objects. (DONE: Added type validation and try-except blocks)

## Medium Severity (Bugs & Error Handling)
- [x] **Unsafe Background Threads in Views**: In `backend/api/views.py` (`attendance_list` and others), detached Python threads (`threading.Thread`) are spawned to run background tasks (like `auto_logout` and emails). This is unsafe in WSGI production environments (e.g., Gunicorn) and can lead to dropped tasks or memory leaks. Consider using Celery, Django Q, or a cron-based management command. (DONE: Replaced with `ThreadPoolExecutor` for emails; periodic tasks removed from views)
- [x] **Information Disclosure (Error Handling)**: Broad `except Exception as e:` blocks in `backend/api/views.py` (e.g., `request_password_reset`, `attendance_list`) return `traceback.format_exc()` or raw exception strings directly to the client. These should be logged securely and return generic 500 error messages to the client. (DONE: Implemented `logging` and generic error responses)
- [ ] **Race Conditions in Leave Approval**: In `approve_leave`, user profiles are automatically created if they don't exist based on concurrent requests, which could lead to unique constraint failures under load.

## Low Severity (Dead Code & Cleanup)
- [ ] **Dead Code (Scratch Directory)**: The `scratch/` folder contains testing scripts (`check_8h.py`, `check_db.py`, `test_api.py`, `test_email.py`). These should be removed from the production codebase or moved to a dedicated testing repository.
- [ ] **Hardcoded API URLs**: Frontend `login.jsx` uses hardcoded API proxy logic (`http://localhost:8001/api/v1/`). This should ideally utilize Vite's `import.meta.env` for environment-specific backend routing.

