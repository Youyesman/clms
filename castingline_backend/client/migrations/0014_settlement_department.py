# 부금처 목록 모델 생성 + 시드
# - 기존 프론트 하드코딩 목록(SETTLEMENT_DEPARTMENTS)을 그대로 시드하고,
# - 이미 거래처에 입력되어 있는 부금처 값도 누락 없이 목록에 포함시킨다.
from django.db import migrations, models

DEFAULT_DEPARTMENTS = [
    "CGV 직영",
    "롯데 직영",
    "메가박스 직영",
    "시네마케이",
    "알엔알",
    "삼광필름",
    "포스시네마",
    "작은영화관 주식회사",
    "JT미디어",
    "지원",
]


def seed_departments(apps, schema_editor):
    SettlementDepartment = apps.get_model("client", "SettlementDepartment")
    Client = apps.get_model("client", "Client")

    names = list(DEFAULT_DEPARTMENTS)

    # 거래처에 실제로 쓰이고 있는 부금처 값도 목록에 포함 (드롭다운 값 유실 방지)
    in_use = (
        Client.objects.exclude(settlement_department__isnull=True)
        .exclude(settlement_department="")
        .values_list("settlement_department", flat=True)
        .distinct()
    )
    for name in in_use:
        if name not in names:
            names.append(name)

    for order, name in enumerate(names):
        SettlementDepartment.objects.get_or_create(
            name=name, defaults={"sort_order": order}
        )


def unseed_departments(apps, schema_editor):
    SettlementDepartment = apps.get_model("client", "SettlementDepartment")
    SettlementDepartment.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("client", "0013_seed_rate_exception_theaters"),
    ]

    operations = [
        migrations.CreateModel(
            name="SettlementDepartment",
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
                (
                    "name",
                    models.CharField(
                        max_length=255, unique=True, verbose_name="부금처명"
                    ),
                ),
                (
                    "sort_order",
                    models.IntegerField(default=0, verbose_name="정렬순서"),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "부금처",
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.RunPython(seed_departments, unseed_departments),
    ]
