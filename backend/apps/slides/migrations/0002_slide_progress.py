from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("slides", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="slide",
            name="tiles_total",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="slide",
            name="tiles_done",
            field=models.IntegerField(default=0),
        ),
    ]
