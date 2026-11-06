"""M001(1106): 극장별 예외 부율을 국적별(한국영화/외화) 숫자로 분리.

기존 rate_exception_type 값 변환:
  '모두' → 한국 55 / 외화 55
  '외화' → 외화 55 (한국은 빈 값 = 기본 규칙)
"""
from decimal import Decimal

from django.db import migrations, models


def forwards(apps, schema_editor):
    Client = apps.get_model("client", "Client")
    Client.objects.filter(rate_exception_type="모두").update(
        rate_exception_domestic=Decimal("55"), rate_exception_foreign=Decimal("55"))
    Client.objects.filter(rate_exception_type="외화").update(
        rate_exception_foreign=Decimal("55"))


def backwards(apps, schema_editor):
    # 필드 제거로 되돌아가므로 별도 복원 불필요 (rate_exception_type 원본은 그대로 남아 있음)
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("client", "0019_map_direct_theater_settlement_department"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="rate_exception_domestic",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name="client",
            name="rate_exception_foreign",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.RunPython(forwards, backwards),
    ]
