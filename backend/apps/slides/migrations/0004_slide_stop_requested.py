from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("slides", "0003_slide_mpp_source_slide_mpp_value"),
    ]

    operations = [
        migrations.AddField(
            model_name="slide",
            name="stop_requested",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="slide",
            name="status",
            field=models.CharField(
                choices=[
                    ("CREATED", "Created"),
                    ("QUEUED", "Queued"),
                    ("RUNNING", "Running"),
                    ("COMPLETED", "Completed"),
                    ("FAILED", "Failed"),
                    ("CANCELLED", "Cancelled"),
                ],
                default="CREATED",
                max_length=20,
            ),
        ),
    ]
