# M001(1020): 주요 멀티플렉스 직영 극장 '부금처' 일괄 매핑
# - 멀티(theater_kind) × 직영(classification) 조건으로 부금처를 일괄 지정한다.
# - 폐관 극장 포함, 기존에 다른 부금처가 들어 있어도 덮어쓴다. (사용자 확인 완료)
# - '씨네큐 직영'은 부금처 목록(SettlementDepartment)에 없으므로 먼저 추가한다.
from django.db import migrations

# (멀티 값, 지정할 부금처명) — Client.theater_kind 실제 저장값 기준
DIRECT_DEPARTMENTS = [
    ("CGV", "CGV 직영"),
    ("롯데", "롯데 직영"),
    ("메가박스", "메가박스 직영"),
    ("씨네큐", "씨네큐 직영"),
]


def map_departments(apps, schema_editor):
    Client = apps.get_model("client", "Client")
    SettlementDepartment = apps.get_model("client", "SettlementDepartment")

    # 부금처 목록에 없는 이름은 추가 (드롭다운에 보이도록 기존 목록 뒤에 붙인다)
    last = SettlementDepartment.objects.order_by("-sort_order").first()
    next_order = (last.sort_order + 1) if last else 0
    for _kind, dept in DIRECT_DEPARTMENTS:
        _obj, created = SettlementDepartment.objects.get_or_create(
            name=dept, defaults={"sort_order": next_order}
        )
        if created:
            next_order += 1

    # 극장 거래처 중 멀티×직영 전체를 해당 부금처로 덮어쓴다 (폐관 포함)
    for kind, dept in DIRECT_DEPARTMENTS:
        Client.objects.filter(
            client_type="극장", theater_kind=kind, classification="직영"
        ).update(settlement_department=dept)


def unmap_departments(apps, schema_editor):
    # 되돌리기: 이 마이그레이션이 넣은 값만 비운다 (원래 값은 복원하지 않음)
    Client = apps.get_model("client", "Client")
    for kind, dept in DIRECT_DEPARTMENTS:
        Client.objects.filter(
            client_type="극장", theater_kind=kind, classification="직영",
            settlement_department=dept,
        ).update(settlement_department="")


class Migration(migrations.Migration):

    dependencies = [
        ("client", "0018_client_parent_client"),
    ]

    operations = [
        migrations.RunPython(map_departments, unmap_departments),
    ]
