"""스코어 확정 저장 시 (영화×극장) 조합별 기준 부율(Rate) 자동 생성.

기준 (부율은 배급사 부율):
- 한국영화: CGV/롯데/메가박스 '직영'이면서 '서울' 55%, 그 외 전부 50%
- 외국영화: 롯데 '서울'(직영+위탁) 55%, 그 외 전부 50%
- 예외극장(Client.rate_exception_type): '모두'=한국/외화 모두 55%, '외화'=외화만 55%
- 씨네큐/프리머스/자동차극장 등 표 외 체인은 일반극장과 동일 취급
- 영화 국가(Movie.country)가 미지정이면 생성하지 않고 결과에 영화명을 담아 알린다
- 이미 해당 (영화×극장) Rate가 있으면 건드리지 않는다 (수동 입력 우선)
"""
from datetime import date
from decimal import Decimal

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
    # 1. (영화, 극장) 조합별 최소 상영일 집계 (개봉일 미입력 시 시작일 대체용)
    pair_first_date = {}
    for i in valid_data:
        key = (i["movie_id"], i["client_id"])
        entry_date = parse_date(i["entry_date"])
        if entry_date and (key not in pair_first_date or entry_date < pair_first_date[key]):
            pair_first_date[key] = entry_date

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

        start_date = movie.release_date or first_date
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
