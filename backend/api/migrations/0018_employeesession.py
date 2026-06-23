# Manually written to add the server-side EmployeeSession model.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0017_attendancescreenshot"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmployeeSession",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("token", models.CharField(db_index=True, max_length=100, unique=True)),
                ("employee_id", models.CharField(db_index=True, max_length=50)),
                ("employee_name", models.CharField(blank=True, default="", max_length=255)),
                ("device_label", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("is_active", models.BooleanField(default=True)),
                ("last_seen", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
