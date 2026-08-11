"""스코어 확정 저장 시 (영화×극장) 조합별 기준 부율(Rate) 자동 생성.

기준 (부율은 배급사 부율):
- 한국영화: CGV/롯데/메가박스 '직영'이면서 '서울' 55%, 그 외 전부 50%
- 외국영화: 롯데 '서울'(직영+위탁) 55%, 그 외 전부 50%
- 예외극장(Client.rate_exception_type): '모두'=한국/외화 모두 55%, '외화'=외화만 55%
- 씨네큐/프리머스/자동차극장 등 표 외 체인은 일반극장과 동일 취급
- 영화 국가(Movie.country)가 미지정이면 생성하지 않고 결과에 영화명을 담아 알린다
- 이미 해당 (영화×극장) Rate가 있으면 건드리지 않는다 (수동 입력 우선)
- 시작일은 해당 (영화×극장)의 실제 최초 스코어 발생일, 종료일은 9999-12-31
"""
from datetime import date
from decimal import Decimal

from django.db.models import Min

from client.models import Client
from movie.models import Movie
from rate.models import Rate

# 기존 부율 데이터의 무기한 종료일 관례 (end_date 최빈값)
RATE_OPEN_END_DATE = date(9999, 12, 31)

SEOUL_REGION_CODES = ("서울", "01")
DOMESTIC_COUNTRIES = ("한국", "대한민국")
MAJOR_CHAINS = ("CGV", "롯데", "메가박스")


def _is_seoul(client):
    return (client.region_code or "").strip() in SEOUL_REGION_CODES


def _resolve_share_rate(client, is_domestic):
    """극장 구분(예외극장/체인/직영/지역)과 한국·외화 여부에 따른 기준 부율."""
    exception_type = (client.rate_exception_type or "").strip()
    if exception_type == "모두" or (exception_type == "외화" and not is_domestic):
        return Decimal("55")

    kind = (client.theater_kind or "").strip()
    classification = (client.classification or "").strip()

    if is_domestic:
        # 한국영화: 체인 3사 직영+서울만 55%
        if kind in MAJOR_CHAINS and classification == "직영" and _is_seoul(client):
            return Decimal("55")
        return Decimal("50")

    # 외국영화: 롯데 서울(직영+위탁)만 55%
    if kind == "롯데" and _is_seoul(client):
        return Decimal("55")
    return Decimal("50")


def _resolve_country(movie, primary_by_code):
    """하위(포맷)영화에 국가가 없으면 대표영화의 국가로 판단."""
    country = (movie.country or "").strip()
    if not country and movie.primary_movie_code:
        primary = primary_by_code.get(movie.primary_movie_code)
        if primary:
            country = (primary.country or "").strip()
    return country


def auto_create_rates(valid_data, parse_date):
    """확정 저장 데이터의 (영화×극장) 조합 중 부율이 없는 곳에 기준 부율을 생성.

    반환: {"created": 생성 건수, "skipped_no_country": [국가 미지정 영화명, ...]}
    """
    # 1. (영화, 극장) 조합별 최소 상영일 집계 (= 부율 시작일)
    pair_first_date = {}
    for i in valid_data:
        key = (i["movie_id"], i["client_id"])
        entry_date = parse_date(i["entry_date"])
        if entry_date and (key not in pair_first_date or entry_date < pair_first_date[key]):
            pair_first_date[key] = entry_date

    return auto_create_rates_for_pairs(pair_first_date)


def auto_create_rates_for_pairs(pair_first_date):
    """(영화ID, 극장ID) → 최초 상영일 매핑을 받아 기준 부율을 생성.

    엑셀 확정 저장뿐 아니라 스코어 직접 입력/일괄 저장 경로에서도 재사용한다(P001).
    """
    pair_first_date = {k: v for k, v in pair_first_date.items() if k[0] and k[1] and v}
    if not pair_first_date:
        return {"created": 0, "skipped_no_country": []}

    movie_ids = {m_id for m_id, _ in pair_first_date}
    client_ids = {c_id for _, c_id in pair_first_date}

    movies = {m.id: m for m in Movie.objects.filter(id__in=movie_ids)}
    clients = {c.id: c for c in Client.objects.filter(id__in=client_ids)}

    # 국가가 빈 하위영화의 대표영화 국가 조회
    primary_codes = {
        m.primary_movie_code
        for m in movies.values()
        if not (m.country or "").strip() and m.primary_movie_code
    }
    primary_by_code = (
        {m.movie_code: m for m in Movie.objects.filter(movie_code__in=primary_codes)}
        if primary_codes
        else {}
    )

    # 이미 부율이 등록된 조합은 제외
    existing_pairs = set(
        Rate.objects.filter(movie_id__in=movie_ids, client_id__in=client_ids)
        .values_list("movie_id", "client_id")
    )

    # 부율 시작일은 '실제 스코어 발생일'(P002). 이번 배치보다 앞선 스코어가 이미
    # DB에 있으면(국가 미지정으로 건너뛴 뒤 재확정한 경우 등) 그 날짜까지 소급한다.
    from score.models import Score  # 순환 임포트 방지용 지연 임포트

    for row in (
        Score.objects.filter(movie_id__in=movie_ids, client_id__in=client_ids)
        .values("movie_id", "client_id")
        .annotate(first_date=Min("entry_date"))
    ):
        key = (row["movie_id"], row["client_id"])
        existing_first = row["first_date"]
        if key in pair_first_date and existing_first and existing_first < pair_first_date[key]:
            pair_first_date[key] = existing_first

    rates_to_create = []
    skipped_no_country = set()
    for (movie_id, client_id), first_date in pair_first_date.items():
        if (movie_id, client_id) in existing_pairs:
            continue
        movie = movies.get(movie_id)
        client = clients.get(client_id)
        if not movie or not client:
            continue

        country = _resolve_country(movie, primary_by_code)
        if not country:
            skipped_no_country.add(movie.title_ko or f"영화ID {movie_id}")
            continue

        # 시작일 = 실제 스코어 발생일 (개봉일이 아님 — P002).
        # 개봉 전 시사/유료시사 스코어가 개봉일보다 앞서는 경우가 있어
        # 개봉일을 쓰면 부율이 해당 스코어를 덮지 못한다.
        start_date = first_date
        rates_to_create.append(
            Rate(
                client_id=client_id,
                movie_id=movie_id,
                start_date=start_date,
                end_date=RATE_OPEN_END_DATE,
                share_rate=_resolve_share_rate(client, country in DOMESTIC_COUNTRIES),
            )
        )

    if rates_to_create:
        Rate.objects.bulk_create(rates_to_create, batch_size=500)

    return {
        "created": len(rates_to_create),
        "skipped_no_country": sorted(skipped_no_country),
    }


def auto_create_rates_for_score_pairs(pairs):
    """(영화ID, 극장ID) 집합에 대해 DB의 최초 스코어일 기준으로 기준 부율 생성.

    스코어 직접 입력/일괄 저장(매트릭스) 경로에서 호출한다(P001).
    """
    from score.models import Score  # 순환 임포트 방지용 지연 임포트

    pairs = {(m, c) for m, c in pairs if m and c}
    if not pairs:
        return {"created": 0, "skipped_no_country": []}

    movie_ids = {m for m, _ in pairs}
    client_ids = {c for _, c in pairs}
    pair_first_date = {}
    for row in (
        Score.objects.filter(movie_id__in=movie_ids, client_id__in=client_ids)
        .values("movie_id", "client_id")
        .annotate(first_date=Min("entry_date"))
    ):
        key = (row["movie_id"], row["client_id"])
        if key in pairs and row["first_date"]:
            pair_first_date[key] = row["first_date"]

    return auto_create_rates_for_pairs(pair_first_date)
