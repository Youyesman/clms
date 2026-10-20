"""극장명 매핑(DistributorTheaterMap) 자동 생성·계열사 동시 적용 (N002, 1020)

- 신규 극장 등록(거래처 구분이 '극장'이 되는 시점)에 매핑 대상 배급사별 기본 행을 만든다.
  배급사측 지정명은 공란으로 두어 미설정 건을 한눈에 식별할 수 있게 한다.
- 이력 추가/수정 시 '계열사에도 동일 적용'을 요청하면 계열사 배급사에도 같은
  날짜·지정명 이력을 함께 만든다. 계열사는 NEW ↔ 콘텐츠판다 고정(사용자 확인).
"""
from datetime import date

from django.db.models import Q

from .models import Client, DistributorTheaterMap

# 계열사 그룹 — 거래처 코드 기준 (NEW 20100014, 콘텐츠판다 20210002)
AFFILIATE_GROUPS = [
    ("20100014", "20210002"),
]


def map_target_distributors():
    """극장명 매핑 대상 배급사 쿼리셋 (매핑 화면의 배급사 목록과 같은 조건)."""
    return Client.objects.filter(
        distributor_theater_name="배급사별 극장명",
        client_type__in=["제작사", "배급사"],
    )


def affiliate_distributors(distributor_id):
    """해당 배급사의 계열사(자기 자신 제외) 목록."""
    try:
        me = Client.objects.only("id", "client_code").get(id=distributor_id)
    except Client.DoesNotExist:
        return []
    my_code = str(me.client_code or "")
    for group in AFFILIATE_GROUPS:
        if my_code in group:
            others = [c for c in group if c != my_code]
            return list(Client.objects.filter(client_code__in=others).order_by("client_name"))
    return []


def ensure_default_theater_maps(theater, apply_date=None):
    """극장에 매핑이 하나도 없는 배급사마다 기본 행(지정명 공란, 적용일=등록일)을 만든다.

    이미 이력이 있는 (배급사, 극장) 쌍은 건드리지 않으므로 몇 번 불러도 안전하다.
    반환: 새로 만든 행 수
    """
    if theater is None or theater.client_type != "극장":
        return 0
    apply_date = apply_date or date.today()
    existing = set(
        DistributorTheaterMap.objects.filter(theater=theater)
        .values_list("distributor_id", flat=True)
    )
    created = 0
    for dist in map_target_distributors().exclude(id__in=existing):
        DistributorTheaterMap.objects.get_or_create(
            distributor=dist, theater=theater, apply_date=apply_date,
            defaults={"distributor_theater_name": ""},
        )
        created += 1
    return created


def sync_affiliate_maps(instance, prev_apply_date=None):
    """이력 1건을 계열사 배급사에도 동일하게 반영한다.

    - 추가: 계열사에 같은 (극장, 적용일) 행을 만들고 지정명을 맞춘다.
    - 수정: 수정 전 적용일(prev_apply_date)과 같은 계열사 행이 있으면 그 행을
      새 적용일·지정명으로 바꾸고, 없으면 새로 만든다.
    반환: 반영된 계열사 행 수
    """
    affected = 0
    for aff in affiliate_distributors(instance.distributor_id):
        row = None
        if prev_apply_date is not None:
            row = DistributorTheaterMap.objects.filter(
                distributor=aff, theater_id=instance.theater_id, apply_date=prev_apply_date
            ).first()
        if row is None:
            row = DistributorTheaterMap.objects.filter(
                distributor=aff, theater_id=instance.theater_id, apply_date=instance.apply_date
            ).first()
        if row is None:
            DistributorTheaterMap.objects.create(
                distributor=aff, theater_id=instance.theater_id,
                apply_date=instance.apply_date,
                distributor_theater_name=instance.distributor_theater_name,
            )
        else:
            # 같은 극장의 다른 행과 적용일이 겹치면 unique 제약 위반이므로 건너뛴다
            clash = DistributorTheaterMap.objects.filter(
                distributor=aff, theater_id=instance.theater_id, apply_date=instance.apply_date
            ).exclude(id=row.id).exists()
            if clash:
                continue
            row.apply_date = instance.apply_date
            row.distributor_theater_name = instance.distributor_theater_name
            row.save(update_fields=["apply_date", "distributor_theater_name"])
        affected += 1
    return affected
