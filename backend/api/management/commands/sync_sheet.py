from django.core.management.base import BaseCommand

from api.employee_sync import sync_from_sheet


class Command(BaseCommand):
    help = (
        "Pull the employee roster from the Google Sheet and reconcile the DB: "
        "create new hires, reactivate returns, and soft-delete (deactivate) "
        "employees removed from the sheet."
    )

    def handle(self, *args, **options):
        summary = sync_from_sheet()
        if summary is None:
            self.stderr.write(
                "Sheet unavailable or empty — DB left untouched (nothing reconciled)."
            )
            return
        self.stdout.write(self.style.SUCCESS(f"Sheet sync complete: {summary}"))
