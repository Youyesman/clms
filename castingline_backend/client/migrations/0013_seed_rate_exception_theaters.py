# 부율 예외극장 시드
# - '모두': 한국영화/외국영화 모두 부율 55% 적용
# - '외화': 외국영화만 부율 55% 적용
from django.db import migrations

EXCEPTION_ALL_CODES = [
    "20110003",  # KU시네마테크
    "20220005",  # 오르페오한남
    "20260001",  # 모노플렉스 바이 이비스 스타일 앰배서더 강남
    "20240039",  # 모노플렉스앳라이즈
    "20140048",  # 인디스페이스
    "20230012",  # 디에이치시네마
]

EXCEPTION_FOREIGN_CODES = [
    "20210003",  # 라이카시네마
]


def seed_exception_theaters(apps, schema_editor):
    Client = apps.get_model("client", "Client")
    Client.objects.filter(client_code__in=EXCEPTION_ALL_CODES).update(
        rate_exception_type="모두"
    )
    Client.objects.filter(client_code__in=EXCEPTION_FOREIGN_CODES).update(
        rate_exception_type="외화"
    )


def unseed_exception_theaters(apps, schema_editor):
    Client = apps.get_model("client", "Client")
    Client.objects.filter(
        client_code__in=EXCEPTION_ALL_CODES + EXCEPTION_FOREIGN_CODES
    ).update(rate_exception_type=None)


class Migration(migrations.Migration):

    dependencies = [
        ("client", "0012_client_rate_exception_type"),
    ]

    operations = [
        migrations.RunPython(seed_exception_theaters, unseed_exception_theaters),
    ]
