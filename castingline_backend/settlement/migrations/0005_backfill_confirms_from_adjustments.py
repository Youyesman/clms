# 확인(SettlementConfirm) 기능 이전에 저장된 수동조정 건 백필.
# 조정을 저장했다는 것 = 그 극장 내역을 확인했다는 것 (사용자 확정 2026-07-12)
from django.db import migrations


def backfill(apps, schema_editor):
    SettlementAdjustment = apps.get_model("settlement", "SettlementAdjustment")
    SettlementConfirm = apps.get_model("settlement", "SettlementConfirm")
    for adj in SettlementAdjustment.objects.all():
        SettlementConfirm.objects.get_or_create(
            yyyymm=adj.yyyymm, movie_id=adj.movie_id, client_id=adj.client_id,
            defaults={"source": "조정", "confirmed_by": ""})


class Migration(migrations.Migration):

    dependencies = [
        ("settlement", "0004_settlementconfirm"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
