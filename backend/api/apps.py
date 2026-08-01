import logging

from django.apps import AppConfig
from django.db.backends.signals import connection_created
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(connection_created)
def configure_sqlite(sender, connection, **kwargs):
    """Put SQLite in WAL mode on every new connection.

    Under the default rollback journal a single writer blocks all readers for
    the duration of its transaction. This app writes from background threads
    (sheet sync, auto-logout, morning reminders) while gunicorn workers are
    serving reads, so those writes were stalling the request pool. WAL lets
    readers proceed concurrently with a writer.

    Django 4.2's SQLite backend has no `init_command` OPTION (that arrived in
    5.1), so this runs off the connection_created signal instead.

    NOTE: WAL keeps a `db.sqlite3-wal` sidecar next to the database. Because
    docker-compose bind-mounts the database as a single *file*, that sidecar
    lands in the container's writable layer rather than on the host, so an
    ungraceful container kill can drop recently-committed frames. The
    autocheckpoint below is tightened to keep that window small; the permanent
    fix is to bind-mount the directory instead of the file.
    """
    if connection.vendor != 'sqlite':
        return

    # Best-effort by design. This runs on EVERY new connection, so an exception
    # escaping here would fail connection setup for every request and take the
    # whole site down. Switching journal modes can legitimately raise
    # SQLITE_BUSY when another connection holds a lock at that moment, so a
    # failure here must degrade to "carry on in the previous journal mode"
    # rather than becoming an outage. WAL is a performance win, not a
    # correctness requirement.
    pragmas = (
        # Readers no longer block behind a writer.
        'PRAGMA journal_mode=WAL;',
        # Durable enough under WAL, without an fsync on every single commit.
        'PRAGMA synchronous=NORMAL;',
        # Checkpoint more eagerly than the 1000-page default so the WAL sidecar
        # stays small and little work is at risk if the container is killed.
        'PRAGMA wal_autocheckpoint=200;',
        # Wait rather than immediately raising "database is locked" when another
        # connection holds the write lock; mirrors the DATABASES OPTIONS timeout.
        'PRAGMA busy_timeout=20000;',
    )
    try:
        with connection.cursor() as cursor:
            for pragma in pragmas:
                cursor.execute(pragma)
    except Exception as e:  # noqa: BLE001 - must never propagate
        logger.warning("Could not apply SQLite tuning pragmas (continuing): %s", e)


class ApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "api"
