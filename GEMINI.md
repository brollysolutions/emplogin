# Project Overview: emplogin

`emplogin` is an Employee Attendance and Management System. It features automated attendance tracking, task management, leave requests, and an internal chat system. The application is built with a decoupled architecture, using a Django backend and a React frontend.

## Architecture

- **Backend**: Django 4.2.16 with Django REST Framework (DRF). (Note: `backend/package.json` appears to be legacy and is not used by the current Django-based system).
- **Frontend**: React 19 powered by Vite.
- **Database**: SQLite (`db.sqlite3`).
- **Containerization**: Docker and Docker Compose.
- **Task Management**: Lightweight background tasks handled via `ThreadPoolExecutor` in the backend.
- **Web Server**: Gunicorn (Backend) and Nginx (Frontend).

## Project Structure

```text
emplogin/
├── backend/            # Django backend application
│   ├── api/            # Main API logic (models, views, tasks)
│   ├── core/           # Django project configuration (settings, urls)
│   ├── media/          # Uploaded media (attendance screenshots, profile photos)
│   ├── Dockerfile      # Backend Docker configuration
│   ├── manage.py       # Django management script
│   └── requirements.txt # Python dependencies
├── frontend/           # React frontend application
│   ├── src/            # Source code
│   │   └── login/      # Main application logic (Dashboard, Admin, Chat)
│   ├── Dockerfile      # Frontend Docker configuration
│   └── package.json    # Node.js dependencies and scripts
└── docker-compose.yml  # Orchestration for development and production
```

## Building and Running

### Prerequisites
- Docker and Docker Compose
- Node.js (for local frontend development)
- Python 3.9+ (for local backend development)

### Using Docker (Recommended)
The project includes configurations for both production and testing in `docker-compose.yml`.

**Production:**
```bash
docker-compose up --build
```
- Frontend: `http://localhost:3001/login`
- Backend: `http://localhost:8001/api/v1`

### Local Development

**Backend:**
1. Navigate to `backend/`.
2. Install dependencies: `pip install -r requirements.txt`.
3. Set up `.env` (copy from existing or create with `SECRET_KEY`, `EMAIL_HOST_USER`, etc.).
4. Run migrations: `python manage.py migrate`.
5. Start server: `python manage.py runserver 8001`.

**Frontend:**
1. Navigate to `frontend/`.
2. Install dependencies: `npm install`.
3. Start dev server: `npm run dev`.

## Key Features & Components

- **Attendance Tracking**: Captures login/logout times, breaks, and periodic screenshots.
- **Task Management**: Admins can assign tasks; employees can view and mark them as completed.
- **Leave Requests**: Formal workflow for applying, approving, and rejecting leave requests.
- **Internal Chat**: Support for direct messages and group chats among employees.
- **Automated Reminders**: SMTP-based email reminders for attendance and tasks.
- **Auto Logout**: Management command to automatically logout inactive employees.

## Development Conventions

- **Frontend Monolith**: The core logic resides in `frontend/src/login/login.jsx`. Be cautious when making changes as this file is very large.
- **Async Tasks**: For lightweight background tasks (like sending emails), use the `run_async` helper in `backend/api/tasks.py`.
- **Environment Variables**: Always use environment variables for sensitive information (secrets, email credentials). These are loaded via `python-dotenv` in the backend.
- **API Versioning**: The health check endpoint (`/api/v1/health/`) returns the current system version and server start time.

## AI Behavioral Guidelines

To ensure high-quality and safe modifications to this codebase, all AI interactions should adhere to these principles:

### 1. Think Before Coding
- **State assumptions explicitly.** If uncertain, ask for clarification.
- **Present tradeoffs.** If multiple interpretations or solutions exist, discuss them before implementation.
- **Simplicity first.** Suggest simpler approaches when they exist.

### 2. Simplicity & Minimality
- **Minimum code that solves the problem.** Avoid speculative features or unnecessary abstractions.
- **No requested "flexibility" or "configurability" unless explicitly asked.**
- **Avoid over-engineering.** If a complex solution can be simplified, do so.

### 3. Surgical Changes
- **Touch only what you must.** Match existing style and conventions.
- **No "drive-by" refactoring.** Only clean up code your changes made obsolete (orphans).
- **Preserve existing style.** Even if you'd do it differently, follow the local patterns.

### 4. Goal-Driven Execution
- **Define success criteria.** State a brief plan before executing multi-step tasks.
- **Verify changes.** Loop until the behavioral correctness is confirmed (e.g., via tests or logs).
- **Reproduction first.** For bugs, always attempt to reproduce the failure before applying a fix.

