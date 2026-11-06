"""F001(1106): 부금정산 확인을 행 단위로 — row_key 추가 (기존 레코드는 ""=극장 전체 확인 유지)."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settlement', '0008_settlementadjustment_date_to_is_bulk_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='settlementconfirm',
            name='row_key',
            field=models.CharField(blank=True, default='', max_length=255, verbose_name='행 키'),
        ),
        migrations.AlterUniqueTogether(
            name='settlementconfirm',
            unique_together={('yyyymm', 'movie', 'client', 'row_key')},
        ),
    ]
