# O002: 종영일 자동 연장 강조 플래그 + O003: 오더 중복 병합·유니크 제약
from django.db import migrations, models
from django.db.models import Count


def merge_duplicate_orders(apps, schema_editor):
    """O003: 같은 (영화×극장) 오더 중복을 하나로 병합한다.

    중복은 중복 방지 로직 도입 전(7/30 데이터 이관 시점) 동시 업로드로 생긴 것.
    먼저 생성된 행을 남기고, 날짜는 넓은 범위로(개봉일 min · 종영일/마지막상영 max),
    비고는 이어붙여 병합한 뒤 나머지를 삭제한다.
    """
    Order = apps.get_model("order", "Order")

    dup_pairs = (
        Order.objects.filter(movie__isnull=False, client__isnull=False)
        .values("movie_id", "client_id")
        .annotate(cnt=Count("id"))
        .filter(cnt__gt=1)
    )
    for pair in dup_pairs:
        rows = list(
            Order.objects.filter(
                movie_id=pair["movie_id"], client_id=pair["client_id"]
            ).order_by("id")
        )
        keep, extras = rows[0], rows[1:]
        changed = False
        for e in extras:
            if e.release_date and (
                not keep.release_date or e.release_date < keep.release_date
            ):
                keep.release_date = e.release_date
                changed = True
            if e.start_date and (
                not keep.start_date or e.start_date < keep.start_date
            ):
                keep.start_date = e.start_date
                changed = True
            if e.end_date and (not keep.end_date or e.end_date > keep.end_date):
                keep.end_date = e.end_date
                changed = True
            if e.last_screening_date and (
                not keep.last_screening_date
                or e.last_screening_date > keep.last_screening_date
            ):
                keep.last_screening_date = e.last_screening_date
                changed = True
            if e.remark and e.remark not in (keep.remark or ""):
                keep.remark = f"{keep.remark} / {e.remark}" if keep.remark else e.remark
                changed = True
        if changed:
            keep.save()
        Order.objects.filter(id__in=[e.id for e in extras]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("order", "0007_alter_orderlist_movie"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="end_date_auto_updated",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(merge_duplicate_orders, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="order",
            constraint=models.UniqueConstraint(
                condition=models.Q(("client__isnull", False), ("movie__isnull", False)),
                fields=("movie", "client"),
                name="uniq_order_movie_client",
            ),
        ),
    ]
