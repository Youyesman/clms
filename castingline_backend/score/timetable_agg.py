# -*- coding: utf-8 -*-
"""T001·T003(0827): 시간표 조회 화면 개편용 집계 모듈.

- T001 집계작 시간표: KEY SUMMARY(합계+일별) / 지역별·포맷별 상세(일별 컬럼+비중)
  / 상영일자 추이(4개 지표, 금주 실선 vs 전주 점선) 데이터를 만든다.
- T003 경쟁작: 크롤링한 경쟁작 데이터를 기간 합산 + 일별 탭으로 집계한다.

숫자 규칙은 기존 화면·크롤러 보고서와 동일하게 맞춘다:
- 판매(예매)좌석수 = 좌석 정보가 있는 회차만 (총좌석-잔여), 좌석점유율 = SUM/SUM
- 극장수 = 기간 전체 고유 극장 수 / 스크린수 = 일자별 고유 (극장+관) 수의 합
- 전주 = 각 날짜의 정확히 7일 전(같은 요일)
- 일반극장(KOBIS)은 크롤러 엑셀과 같은 인덱스로 지역·좌석수를 보강한다 (V001)
"""
import re
from collections import defaultdict
from datetime import timedelta

from castingline_backend.utils.ordering import REGION_ORDER

# 계열사 표기·순서 (기존 집계작 시간표와 동일)
BRAND_DISPLAY = {'CGV': 'CGV', 'LOTTE': '롯데', 'MEGABOX': '메가박스',
                 '일반극장': '일반극장', 'OTHER': '일반'}
CHAIN_ORDER = ['CGV', '롯데', '메가박스', '일반극장', '일반']

WEEKDAY_KO = ['월', '화', '수', '목', '금', '토', '일']


def _norm_str(s):
    return re.sub(r'[^a-zA-Z0-9가-힣]', '', str(s or '')).lower()


def _build_client_maps():
    """(brand, 공백제거 극장명) → 지역 / 직위 매핑 (기존 score_timetable과 동일)."""
    from client.models import Client

    clients = list(Client.objects.values(
        'theater_kind', 'excel_theater_name', 'excel_theater_name2', 'theater_name',
        'region_code', 'classification'
    ))

    region_map, classif_map = {}, {}

    def norm_brand(kind):
        if not kind:
            return None
        k = kind.upper()
        if 'CGV' in k:
            return 'CGV'
        if 'LOTTE' in k or '롯데' in k:
            return 'LOTTE'
        if 'MEGA' in k or '메가' in k:
            return 'MEGABOX'
        return None

    for c in clients:
        b = norm_brand(c['theater_kind'])
        if not b:
            continue
        region = c['region_code']
        cls = c['classification'] or '-'
        for field in ('excel_theater_name', 'excel_theater_name2', 'theater_name'):
            name = c.get(field)
            if name:
                key = (b, name.replace(' ', ''))
                if region:
                    region_map[key] = region
                classif_map[key] = cls
    return region_map, classif_map


def _strip_prefix(s):
    return (s.replace("CGV", "").replace("롯데시네마", "").replace("롯데", "")
             .replace("메가박스", "").replace("씨네큐", "").replace(" ", ""))


def _get_region(brand, theater, region_map):
    """멀티 3사 극장의 지역 판별 (기존 score_timetable.get_client_info와 동일 규칙)."""
    clean = theater.replace(" ", "")
    r = region_map.get((brand, clean))
    if r:
        return r
    crawl_pure = _strip_prefix(theater)
    for (mb, mn), mr in region_map.items():
        if mb != brand:
            continue
        cp = _strip_prefix(mn)
        if crawl_pure == cp or (len(cp) >= 2 and len(crawl_pure) >= 2 and
                                (cp in crawl_pure or crawl_pure in cp)):
            return mr
    return '기타'


def _iter_rows(schedules, region_map, normal_index):
    """MovieSchedule values() 행 → 정규화된 dict 스트림.

    yield: {date, brand(원본), bd(표시명), theater, screen, seats, sold,
            region, start_time, tags}
    """
    from crawler.utils.excel_exporter import _resolve_normal_theater

    for s in schedules:
        brand = s['brand']
        bd = BRAND_DISPLAY.get(brand, brand)
        theater = s['theater_name']
        screen = s['screen_name']
        ts = s['total_seats'] or 0
        rem = s['remaining_seats'] or 0
        if brand == '일반극장':
            info = _resolve_normal_theater(theater, screen, normal_index)
            if info:
                region = info['region'] if info['region'] in REGION_ORDER else '기타'
                if ts <= 0 and info['seat']:
                    ts = info['seat']
            else:
                region = '기타'
        else:
            region = _get_region(brand, theater, region_map)
        # 좌석 정보가 없는 회차는 잔여좌석을 모르므로 판매좌석수 0 (엑셀과 동일)
        sold = max(0, ts - rem) if ts > 0 else 0
        yield {
            'date': s['play_date'],
            'brand': brand, 'bd': bd,
            'theater': theater, 'screen': screen,
            'seats': ts, 'sold': sold,
            'region': region,
            'start_time': s['start_time'],
            'tags': s['tags'] or [],
        }


def _fetch_schedules(titles, dates):
    from crawler.models import MovieSchedule

    return list(
        MovieSchedule.objects.filter(
            movie_title__in=titles, play_date__in=list(dates),
        ).values('brand', 'theater_name', 'screen_name', 'start_time',
                 'play_date', 'total_seats', 'remaining_seats', 'tags',
                 'movie_title')
    )


def _match_titles(target_title):
    """DB의 movie_title 중 대상 영화와 매칭되는 제목 목록 (기존 화면과 동일 규칙)."""
    from crawler.models import MovieSchedule

    clean_target = _norm_str(target_title)
    all_titles = list(MovieSchedule.objects.values_list('movie_title', flat=True).distinct())
    return [t for t in all_titles if clean_target and clean_target in _norm_str(t)]


# =====================================================================
# T001: 집계작 시간표
# =====================================================================

def _empty_bucket():
    return {'seats': 0, 'sold': 0, 'shows': 0,
            'theaters': set(), 'day_screens': set()}


def _acc(bucket, r):
    bucket['seats'] += r['seats']
    bucket['sold'] += r['sold']
    bucket['shows'] += 1
    bucket['theaters'].add((r['brand'], r['theater']))
    bucket['day_screens'].add((r['date'], r['brand'], r['theater'], r['screen']))


def _collect_timetable(titles, dates, maps, normal_index):
    """기간 하나(금주 또는 전주)의 집계 묶음."""
    total = _empty_bucket()
    by_day = defaultdict(_empty_bucket)                 # date → bucket
    by_region = defaultdict(_empty_bucket)              # region → bucket
    by_region_day = defaultdict(int)                    # (region, date) → seats
    by_brand = defaultdict(_empty_bucket)               # bd → bucket
    by_brand_day = defaultdict(int)                     # (bd, date) → seats

    if titles:
        for r in _iter_rows(_fetch_schedules(titles, dates), maps, normal_index):
            _acc(total, r)
            _acc(by_day[r['date']], r)
            _acc(by_region[r['region']], r)
            by_region_day[(r['region'], r['date'])] += r['seats']
            _acc(by_brand[r['bd']], r)
            by_brand_day[(r['bd'], r['date'])] += r['seats']

    return {
        'total': total, 'by_day': by_day,
        'by_region': by_region, 'by_region_day': by_region_day,
        'by_brand': by_brand, 'by_brand_day': by_brand_day,
    }


def _kpis(bucket):
    seats, sold = bucket['seats'], bucket['sold']
    return {
        'total_seats': seats,
        'sold_seats': sold,
        'occupancy': round(sold / seats * 100, 1) if seats > 0 else 0.0,
        'shows': bucket['shows'],
        'theaters': len(bucket['theaters']),
        'screens': len(bucket['day_screens']),
    }


def _cmp_num(cur, prev):
    diff = cur - prev
    return {'diff': diff, 'rate': round(diff / prev * 100, 1) if prev else None}


def _date_label(d):
    return f"{d.month}/{d.day} ({WEEKDAY_KO[d.weekday()]})"


def build_timetable_data(movie, d_from, d_to):
    """T001: 집계작 시간표 화면 데이터 (KEY SUMMARY / 지역별 / 포맷별 / 추이)."""
    from crawler.utils.excel_exporter import _build_normal_theater_index

    cur_dates = [d_from + timedelta(days=i) for i in range((d_to - d_from).days + 1)]
    prev_dates = [d - timedelta(days=7) for d in cur_dates]

    matched_titles = _match_titles(movie.title_ko)

    region_map, _classif_map = _build_client_maps()
    normal_index = _build_normal_theater_index()

    cur = _collect_timetable(matched_titles, cur_dates, region_map, normal_index)
    prev = _collect_timetable(matched_titles, prev_dates, region_map, normal_index)
    has_prev = prev['total']['shows'] > 0

    # ---- KEY SUMMARY ----
    total_kpi = _kpis(cur['total'])
    cmp_ = None
    if has_prev:
        p = _kpis(prev['total'])
        cmp_ = {
            'total_seats': _cmp_num(total_kpi['total_seats'], p['total_seats']),
            'sold_seats': _cmp_num(total_kpi['sold_seats'], p['sold_seats']),
            'occupancy': {'diff': round(total_kpi['occupancy'] - p['occupancy'], 1)},
            'shows': _cmp_num(total_kpi['shows'], p['shows']),
            'theaters': _cmp_num(total_kpi['theaters'], p['theaters']),
            'screens': _cmp_num(total_kpi['screens'], p['screens']),
        }
    key_summary = {
        'total': {'label': f"합계 ({len(cur_dates)}일)", **total_kpi, 'cmp': cmp_},
        'days': [{'date': str(d), 'label': _date_label(d), **_kpis(cur['by_day'][d])}
                 for d in cur_dates],
    }

    # ---- 지역별 / 포맷별(계열사) 상세 ----
    day_totals = {d: cur['by_day'][d]['seats'] for d in cur_dates}
    grand_seats = cur['total']['seats']

    def detail_rows(by_key, by_key_day, order, count_field):
        keys = [k for k in order if k in by_key]
        keys += sorted(k for k in by_key if k not in order)
        rows = []
        for k in keys:
            b = by_key[k]
            days = []
            for d in cur_dates:
                seats = by_key_day.get((k, d), 0)
                dt = day_totals.get(d, 0)
                days.append({'seats': seats,
                             'share': round(seats / dt * 100, 1) if dt else 0.0})
            rows.append({
                'label': k,
                'days': days,
                'total_seats': b['seats'],
                'total_share': round(b['seats'] / grand_seats * 100, 1) if grand_seats else 0.0,
                'count': (len(b['theaters']) if count_field == 'theaters'
                          else len(b['day_screens'])),
                'shows': b['shows'],
            })
        if rows:
            rows.append({
                'label': '합계',
                'days': [{'seats': day_totals.get(d, 0), 'share': 100.0 if day_totals.get(d, 0) else 0.0}
                         for d in cur_dates],
                'total_seats': grand_seats,
                'total_share': 100.0 if grand_seats else 0.0,
                'count': (len(cur['total']['theaters']) if count_field == 'theaters'
                          else len(cur['total']['day_screens'])),
                'shows': cur['total']['shows'],
                'is_total': True,
            })
        return rows

    region_order = list(REGION_ORDER) + ['기타']
    region_detail = {
        'dates': [str(d) for d in cur_dates],
        'labels': [_date_label(d) for d in cur_dates],
        'count_label': '극장수',
        'rows': detail_rows(cur['by_region'], cur['by_region_day'], region_order, 'theaters'),
    }
    format_detail = {
        'dates': [str(d) for d in cur_dates],
        'labels': [_date_label(d) for d in cur_dates],
        'count_label': '스크린수',
        'rows': detail_rows(cur['by_brand'], cur['by_brand_day'], CHAIN_ORDER, 'screens'),
    }

    # ---- 상영일자 추이 (금주 실선 / 전주 점선) ----
    points = []
    for d, pd_ in zip(cur_dates, prev_dates):
        cur_k = _kpis(cur['by_day'][d]) if d in cur['by_day'] else _kpis(_empty_bucket())
        prev_k = (_kpis(prev['by_day'][pd_])
                  if has_prev and pd_ in prev['by_day'] else None)
        points.append({
            'date': str(d), 'label': _date_label(d), 'prev_date': str(pd_),
            'cur': cur_k, 'prev': prev_k,
        })
    trend = {
        'dates': [str(d) for d in cur_dates],
        'prev_dates': [str(d) for d in prev_dates],
        'points': points,
        'compare_note': ', '.join(
            f"{d.month}/{d.day}↔{pd_.month}/{pd_.day}"
            for d, pd_ in zip(cur_dates, prev_dates)),
    }

    from .views import _last_crawled_str  # 순환 아님: 함수 시점 임포트

    return {
        'meta': {
            'movie_title': movie.title_ko,
            'release_date': str(movie.release_date) if movie.release_date else None,
            'distributor_name': movie.distributor.client_name if movie.distributor else None,
            'last_crawled_at': _last_crawled_str(d_to, titles=matched_titles),
            'date_from': str(d_from), 'date_to': str(d_to),
            'prev_from': str(prev_dates[0]), 'prev_to': str(prev_dates[-1]),
            'has_prev': has_prev,
        },
        'key_summary': key_summary,
        'region_detail': region_detail,
        'format_detail': format_detail,
        'trend': trend,
    }


# =====================================================================
# T003: 경쟁작
# =====================================================================

# 특별관 판별 태그 (섹션 제목: IMAX/4DX/Dolby)
SPECIAL_FORMAT_KEYS = ("IMAX", "4DX", "SCREENX", "DOLBY", "ATMOS")
GOLDEN_START, GOLDEN_END = 14, 21   # 골든타임 14~21시 (시작시각 기준)


def _is_special(tags):
    for t in (tags or []):
        tu = str(t).upper()
        if any(k in tu for k in SPECIAL_FORMAT_KEYS):
            return True
    return False


def _region_group(region):
    """서울 / 수도권(경강) / 그 외 지방 3그룹."""
    if region == '서울':
        return 'seoul'
    if region == '경강':
        return 'metro'
    return 'local'


def _empty_movie_bucket():
    return {
        'seats': 0, 'sold': 0, 'shows': 0,
        'theaters': set(), 'day_screens': set(),
        'region': {g: {'seats': 0, 'sold': 0} for g in ('seoul', 'metro', 'local')},
        'golden_seats': 0, 'golden_sold': 0,
        'special_shows': 0, 'special_seats': 0,
        'brand': defaultdict(int),   # bd → seats
    }


def _acc_movie(bucket, r):
    bucket['seats'] += r['seats']
    bucket['sold'] += r['sold']
    bucket['shows'] += 1
    bucket['theaters'].add((r['brand'], r['theater']))
    bucket['day_screens'].add((r['date'], r['brand'], r['theater'], r['screen']))
    g = _region_group(r['region'])
    bucket['region'][g]['seats'] += r['seats']
    bucket['region'][g]['sold'] += r['sold']
    st = r['start_time']
    if st is not None and GOLDEN_START <= st.hour < GOLDEN_END:
        bucket['golden_seats'] += r['seats']
        bucket['golden_sold'] += r['sold']
    if _is_special(r['tags']):
        bucket['special_shows'] += 1
        bucket['special_seats'] += r['seats']
    bucket['brand'][r['bd']] += r['seats']


def _occ(sold, seats):
    return round(sold / seats * 100, 1) if seats > 0 else 0.0


def _competitor_sections(movie_buckets, title_of):
    """탭 하나(합산 또는 특정 일자)의 섹션 데이터."""
    ordered = sorted(movie_buckets.items(), key=lambda kv: -kv[1]['seats'])

    # ① 종합 요약
    summary = []
    prev_val, prev_rank = None, 0
    for i, (key, b) in enumerate(ordered, 1):
        rank = prev_rank if b['seats'] == prev_val else i
        prev_val, prev_rank = b['seats'], rank
        summary.append({
            'rank': rank,
            'title': title_of[key],
            'total_seats': b['seats'],
            'occupancy': _occ(b['sold'], b['seats']),
            'shows': b['shows'],
            'screens': len(b['day_screens']),
            'theaters': len(b['theaters']),
        })

    # ② 서울 및 주요 권역별 좌석 점유 현황
    regions = []
    for key, b in ordered:
        row = {'title': title_of[key]}
        for g in ('seoul', 'metro', 'local'):
            seats = b['region'][g]['seats']
            sold = b['region'][g]['sold']
            row[g] = {
                'seats': seats,
                'occupancy': _occ(sold, seats),
                'share': round(seats / b['seats'] * 100, 1) if b['seats'] else 0.0,
            }
        regions.append(row)

    # ③ 골든타임(14~21시) 집중도
    golden = []
    for key, b in sorted(movie_buckets.items(), key=lambda kv: -kv[1]['golden_seats']):
        golden.append({
            'title': title_of[key],
            'seats': b['golden_seats'],
            'occupancy': _occ(b['golden_sold'], b['golden_seats']),
            'share': round(b['golden_seats'] / b['seats'] * 100, 1) if b['seats'] else 0.0,
        })

    # ④ 특별관 (IMAX/4DX/Dolby 등)
    special = [
        {'title': title_of[key], 'shows': b['special_shows'], 'seats': b['special_seats']}
        for key, b in sorted(movie_buckets.items(), key=lambda kv: -kv[1]['special_seats'])
        if b['special_shows'] > 0
    ]

    # ⑤ 계열사별 세부 현황 — 행: 계열사 / 열: 작품(순위순)
    movie_titles = [title_of[key] for key, _ in ordered]
    brand_rows = []
    present = set()
    for _, b in ordered:
        present.update(b['brand'].keys())
    for bd in [c for c in CHAIN_ORDER if c in present]:
        cells = []
        for key, b in ordered:
            seats = b['brand'].get(bd, 0)
            cells.append({
                'seats': seats,
                'share': round(seats / b['seats'] * 100, 1) if b['seats'] else 0.0,
            })
        brand_rows.append({'brand': bd, 'cells': cells})

    return {
        'summary': summary,
        'regions': regions,
        'golden': golden,
        'special': special,
        'by_brand': {'movies': movie_titles, 'rows': brand_rows},
    }


def competitor_movie_options():
    """T003 화면의 '경쟁작 선택' 목록 (활성 경쟁작 크롤 대상)."""
    from crawler.models import CrawlTargetMovie, MovieSchedule

    out = []
    for t in CrawlTargetMovie.objects.filter(is_active=True, movie_type='competitor').order_by('id'):
        clean, _ = MovieSchedule.parse_and_normalize_title(t.title)
        out.append({'id': t.id, 'title': clean or t.title})
    return out


def build_competitor_data(d_from, d_to, titles=None, brands=None):
    """T003: 경쟁작 화면 데이터 — 기간 합산 탭 + 일별 탭 (최대 7일).

    titles: 경쟁작 제목 목록(미지정 시 활성 경쟁작 전체)
    brands: ["CGV","LOTTE","MEGABOX","일반극장"] (미지정 시 전체)
    """
    from crawler.models import MovieSchedule
    from crawler.utils.excel_exporter import _build_normal_theater_index

    n_days = (d_to - d_from).days + 1
    if n_days < 1:
        raise ValueError("종료일이 시작일보다 빠릅니다.")
    if n_days > 7:
        raise ValueError("경쟁작 조회 기간은 최대 7일까지 지정할 수 있습니다.")
    cur_dates = [d_from + timedelta(days=i) for i in range(n_days)]

    if not titles:
        titles = [m['title'] for m in competitor_movie_options()]
    if not titles:
        raise ValueError("등록된 경쟁작이 없습니다. [크롤러 관리]에서 경쟁작을 먼저 등록하세요.")

    # 작품 단위 (정규화 키 기준 중복 제거)
    units, seen = [], set()
    for t in titles:
        clean, _ = MovieSchedule.parse_and_normalize_title(t)
        key = MovieSchedule.normalize_title(clean)
        if key and key not in seen:
            seen.add(key)
            units.append({'key': key, 'title': clean})
    title_of = {u['key']: u['title'] for u in units}

    qs = MovieSchedule.objects.filter(play_date__in=cur_dates)
    if brands:
        qs = qs.filter(brand__in=brands)
    schedules = list(qs.values(
        'brand', 'theater_name', 'screen_name', 'start_time',
        'play_date', 'total_seats', 'remaining_seats', 'tags', 'movie_title'))

    region_map, _classif = _build_client_maps()
    normal_index = _build_normal_theater_index()

    # 제목 → 매칭 작품 키 캐시 (크롤러 보고서와 동일한 title_matches 규칙)
    title_cache = {}

    def match_key(raw_title):
        if raw_title not in title_cache:
            matched = [u['key'] for u in units
                       if MovieSchedule.title_matches(u['title'], raw_title)]
            title_cache[raw_title] = matched
        return title_cache[raw_title]

    sum_buckets = defaultdict(_empty_movie_bucket)               # key → bucket
    day_buckets = defaultdict(lambda: defaultdict(_empty_movie_bucket))  # date → key → bucket

    # movie_title별 작품 매칭이 필요하므로 _iter_rows 대신 직접 순회한다
    from crawler.utils.excel_exporter import _resolve_normal_theater
    for s in schedules:
        keys = match_key(s['movie_title'])
        if not keys:
            continue
        brand = s['brand']
        bd = BRAND_DISPLAY.get(brand, brand)
        theater = s['theater_name']
        screen = s['screen_name']
        ts = s['total_seats'] or 0
        rem = s['remaining_seats'] or 0
        if brand == '일반극장':
            info = _resolve_normal_theater(theater, screen, normal_index)
            if info:
                region = info['region'] if info['region'] in REGION_ORDER else '기타'
                if ts <= 0 and info['seat']:
                    ts = info['seat']
            else:
                region = '기타'
        else:
            region = _get_region(brand, theater, region_map)
        sold = max(0, ts - rem) if ts > 0 else 0
        row = {
            'date': s['play_date'], 'brand': brand, 'bd': bd,
            'theater': theater, 'screen': screen,
            'seats': ts, 'sold': sold, 'region': region,
            'start_time': s['start_time'], 'tags': s['tags'] or [],
        }
        for key in keys:
            _acc_movie(sum_buckets[key], row)
            _acc_movie(day_buckets[s['play_date']][key], row)

    if not sum_buckets:
        raise ValueError("해당 기간에 수집된 경쟁작 시간표 데이터가 없습니다.")

    tabs = [{'key': 'sum', 'label': f"기간 합산 ({n_days}일)",
             **_competitor_sections(sum_buckets, title_of)}]
    for d in cur_dates:
        buckets = day_buckets.get(d, {})
        tabs.append({'key': str(d), 'label': _date_label(d),
                     **(_competitor_sections(buckets, title_of) if buckets else
                        {'summary': [], 'regions': [], 'golden': [], 'special': [],
                         'by_brand': {'movies': [], 'rows': []}})})

    from .views import _last_crawled_str

    return {
        'meta': {
            'date_from': str(d_from), 'date_to': str(d_to),
            'movie_count': len(sum_buckets),
            'last_crawled_at': _last_crawled_str(d_to),
        },
        'tabs': tabs,
    }
