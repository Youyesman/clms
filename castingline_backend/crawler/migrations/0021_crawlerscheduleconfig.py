# C007: 자동 크롤링 스케줄 설정 모델
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crawler", "0020_seed_kobis_accounts"),
    ]

    operations = [
        migrations.CreateModel(
            name="CrawlerScheduleConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("enabled", models.BooleanField(default=True)),
                ("run_times", models.JSONField(default=list)),
                ("crawl_days", models.IntegerField(default=3)),
                ("last_runs", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
