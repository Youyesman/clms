# -*- coding: utf-8 -*-
"""T001·T003: 시간표 조회 화면 집계 모듈.

V001/V002(0828) 이후 원칙: **숫자는 [크롤러 관리] 엑셀·보고서와 완전히 동일해야 한다.**
그래서 MovieSchedule 행을 직접 세지 않고, 엑셀과 같은 전처리
`excel_exporter._process_to_rows` 를 거친 행으로만 집계한다. 이 전처리가 담당하는 것:

- 씨네드쉐프 중복 정리(_filter_cine_de_chef) — 안 하면 CGV 좌석수가 부풀어
  오디세이·스파이더맨처럼 씨네드쉐프에 걸린 작품만 수치가 어긋난다 (V002)
- 좌석 정보 없는 회차(일반극장/KOBIS)는 총좌석수만 정원으로 채우고 판매좌석수는 0
  — 안 하면 일반극장 전 회차가 '전석 매진'으로 잡혀 예매좌석수가 부풀었다 (V001)
- 일반극장 극장명·지역 매칭, 더빙/자막 분리

집계 단위도 엑셀과 맞춘다:
- T001(집계작 시간표)은 [크롤러 관리] **보고서**(crawler/report/aggregation.py)와 같은 정의
  → 극장수 = 기간 전체 고유 (브랜드,극장) / 스크린수 = 일자별 고유 (극장+관)의 합
- T003(경쟁작)은 엑셀 **비교표**(_calc_summary)와 같은 정의
  → 극장수 = 고유 (브랜드,극장) / 스크린수 = 행 수(더빙·자막 분리 포함)
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

REGION_DISPLAY_ORDER = list(REGION_ORDER) + ['기타']


def _norm_str(s):
    return re.sub(r'[^a-zA-Z0-9가-힣]', '', str(s or '')).lower()


def _region_of(row):
    """엑셀 전처리가 준 지역을 화면 표기용으로 정리 ('-'·'매핑안됨' → 기타)."""
    r = row.get('region')
    return r if r in REGION_ORDER else '기타'


def _date_label(d):
    return f"{d.month}/{d.day} ({WEEKDAY_KO[d.weekday()]})"


def _match_titles(target_title):
    """DB의 movie_title 중 대상 영화와 매칭되는 제목 목록 (기존 화면과 동일 규칙)."""
    from crawler.models import MovieSchedule

    clean_target = _norm_str(target_title)
    all_titles = list(MovieSchedule.objects.values_list('movie_title', flat=True).distinct())
    return [t for t in all_titles if clean_target and clean_target in _norm_str(t)]


def _build_maps():
    """엑셀과 같은 지역/일반극장 인덱스 (비싸므로 한 번 만들어 재사용)."""
    from crawler.utils.excel_exporter import _build_region_map, _build_normal_theater_index
    return _build_region_map(), _build_normal_theater_index()


def _rows_by_date(titles, dates, maps, brands=None):
    """{상영일: _process_to_rows 결과 행 목록} — 한 작품 단위로 호출해야 한다.

    _process_to_rows 는 씨네드쉐프 정리·더빙/자막 판정을 '한 작품 전체' 기준으로
    하므로, 엑셀과 같은 숫자를 얻으려면 작품별·날짜별로 나눠 호출한다.
    """
    from crawler.models import MovieSchedule
    from crawler.utils.excel_exporter import _process_to_rows

    region_map, normal_index = maps
    out = {}
    if not titles:
        return out

    qs = MovieSchedule.objects.filter(movie_title__in=titles, play_date__in=list(dates))
    if brands:
        qs = qs.filter(brand__in=brands)
    qs = qs.only('brand', 'theater_name', 'screen_name', 'movie_title',
                 'total_seats', 'remaining_seats', 'play_date', 'start_time', 'tags')

    by_date = defaultdict(list)
    for sch in qs:
        by_date[sch.play_date].append(sch)

    for d, schedules in by_date.items():
        rows, _ = _process_to_rows(schedules, region_map, normal_index)
        out[d] = rows
    return out


# =====================================================================
# 공통 집계기
# =====================================================================

def _empty():
    return {'seats': 0, 'sold': 0, 'shows': 0,
            'theaters': set(), 'day_screens': set(), 'screen_rows': 0}


def _acc(b, row, play_date):
    b['seats'] += row['total_seats']
    b['sold'] += row['sold_seats']
    b['shows'] += row['show_count']
    b['theaters'].add((row['brand'], row['theater']))
    b['day_screens'].add((play_date, row['brand'], row['theater'], row['screen']))
    b['screen_rows'] += 1


def _occ(sold, seats):
    return round(sold / seats * 100, 1) if seats > 0 else 0.0


# =====================================================================
# T001: 집계작 시간표
# =====================================================================

def _kpis(b):
    """보고서(aggregation.py)와 같은 정의로 KPI 산출."""
    return {
        'total_seats': b['seats'],
        'sold_seats': b['sold'],
        'occupancy': _occ(b['sold'], b['seats']),
        'shows': b['shows'],
        'theaters': len(b['theaters']),
        'screens': len(b['day_screens']),
    }


def _cmp_num(cur, prev):
    diff = cur - prev
    return {'diff': diff, 'rate': round(diff / prev * 100, 1) if prev else None}


def _collect_timetable(titles, dates, maps):
    """기간 하나(금주 또는 전주)의 집계 묶음."""
    rows_by_date = _rows_by_date(titles, dates, maps)

    total = _empty()
    by_day = defaultdict(_empty)
    by_region = defaultdict(_empty)
    by_region_day = defaultdict(int)
    by_brand = defaultdict(_empty)
    by_brand_day = defaultdict(int)

    for d, rows in rows_by_date.items():
        for r in rows:
            region = _region_of(r)
            bd = BRAND_DISPLAY.get(r['brand'], r['brand'])
            _acc(total, r, d)
            _acc(by_day[d], r, d)
            _acc(by_region[region], r, d)
            by_region_day[(region, d)] += r['total_seats']
            _acc(by_brand[bd], r, d)
            by_brand_day[(bd, d)] += r['total_seats']

    return {'total': total, 'by_day': by_day,
            'by_region': by_region, 'by_region_day': by_region_day,
            'by_brand': by_brand, 'by_brand_day': by_brand_day}


def build_timetable_data(movie, d_from, d_to):
    """T001: 집계작 시간표 화면 데이터 (KEY SUMMARY / 지역별 / 포맷별 / 추이)."""
    cur_dates = [d_from + timedelta(days=i) for i in range((d_to - d_from).days + 1)]
    prev_dates = [d - timedelta(days=7) for d in cur_dates]

    matched_titles = _match_titles(movie.title_ko)
    maps = _build_maps()

    cur = _collect_timetable(matched_titles, cur_dates, maps)
    prev = _collect_timetable(matched_titles, prev_dates, maps)
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
                'days': [{'seats': day_totals.get(d, 0),
                          'share': 100.0 if day_totals.get(d, 0) else 0.0}
                         for d in cur_dates],
                'total_seats': grand_seats,
                'total_share': 100.0 if grand_seats else 0.0,
                'count': (len(cur['total']['theaters']) if count_field == 'theaters'
                          else len(cur['total']['day_screens'])),
                'shows': cur['total']['shows'],
                'is_total': True,
            })
        return rows

    region_detail = {
        'dates': [str(d) for d in cur_dates],
        'labels': [_date_label(d) for d in cur_dates],
        'count_label': '극장수',
        'rows': detail_rows(cur['by_region'], cur['by_region_day'],
                            REGION_DISPLAY_ORDER, 'theaters'),
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
        cur_k = _kpis(cur['by_day'][d]) if d in cur['by_day'] else _kpis(_empty())
        prev_k = (_kpis(prev['by_day'][pd_])
                  if has_prev and pd_ in prev['by_day'] else None)
        points.append({'date': str(d), 'label': _date_label(d), 'prev_date': str(pd_),
                       'cur': cur_k, 'prev': prev_k})
    trend = {
        'dates': [str(d) for d in cur_dates],
        'prev_dates': [str(d) for d in prev_dates],
        'points': points,
        'compare_note': ', '.join(
            f"{d.month}/{d.day}↔{pd_.month}/{pd_.day}"
            for d, pd_ in zip(cur_dates, prev_dates)),
    }

    from .views import _last_crawled_str

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


def _empty_movie():
    return {
        'seats': 0, 'sold': 0, 'shows': 0,
        'theaters': set(), 'screen_rows': 0,
        'region': {g: {'seats': 0, 'sold': 0} for g in ('seoul', 'metro', 'local')},
        'golden_seats': 0, 'golden_sold': 0,
        'special_shows': 0, 'special_seats': 0,
        'brand': defaultdict(int),
    }


def _acc_movie(b, row):
    """엑셀 비교표(_calc_summary)와 같은 정의로 누적."""
    b['seats'] += row['total_seats']
    b['sold'] += row['sold_seats']
    b['shows'] += row['show_count']
    b['theaters'].add((row['brand'], row['theater']))
    b['screen_rows'] += 1                       # = _calc_summary.screen_count

    g = _region_group(_region_of(row))
    b['region'][g]['seats'] += row['total_seats']
    b['region'][g]['sold'] += row['sold_seats']
    b['brand'][BRAND_DISPLAY.get(row['brand'], row['brand'])] += row['total_seats']

    # 회차 단위 지표는 전처리가 준 회차별 상세로 계산 (자체 계산 금지)
    for sh in row.get('shows', []):
        if GOLDEN_START <= sh['hour'] < GOLDEN_END:
            b['golden_seats'] += sh['seats']
            b['golden_sold'] += sh['sold']
        if _is_special(sh['tags']):
            b['special_shows'] += 1
            b['special_seats'] += sh['seats']


def competitor_movie_options():
    """T003 화면의 '경쟁작 선택' 목록 (활성 경쟁작 크롤 대상)."""
    from crawler.models import CrawlTargetMovie, MovieSchedule

    out, seen = [], set()
    for t in CrawlTargetMovie.objects.filter(is_active=True,
                                             movie_type='competitor').order_by('id'):
        clean, _ = MovieSchedule.parse_and_normalize_title(t.title)
        key = MovieSchedule.normalize_title(clean)
        if key and key not in seen:
            seen.add(key)
            out.append({'id': t.id, 'title': clean or t.title})
    return out


def _competitor_sections(buckets, title_of):
    """탭 하나(합산 또는 특정 일자)의 섹션 데이터."""
    ordered = sorted(buckets.items(), key=lambda kv: -kv[1]['seats'])

    # ① 종합 요약 — 비교표 정의와 동일
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
            'screens': b['screen_rows'],
            'theaters': len(b['theaters']),
        })

    # ② 서울 및 주요 권역별 좌석 점유 현황
    regions = []
    for key, b in ordered:
        row = {'title': title_of[key]}
        for g in ('seoul', 'metro', 'local'):
            seats = b['region'][g]['seats']
            sold = b['region'][g]['sold']
            row[g] = {'seats': seats, 'occupancy': _occ(sold, seats),
                      'share': round(seats / b['seats'] * 100, 1) if b['seats'] else 0.0}
        regions.append(row)

    # ③ 골든타임(14~21시) 집중도
    golden = [{'title': title_of[k],
               'seats': b['golden_seats'],
               'occupancy': _occ(b['golden_sold'], b['golden_seats']),
               'share': round(b['golden_seats'] / b['seats'] * 100, 1) if b['seats'] else 0.0}
              for k, b in sorted(buckets.items(), key=lambda kv: -kv[1]['golden_seats'])]

    # ④ 특별관 (IMAX/4DX/Dolby 등)
    special = [{'title': title_of[k], 'shows': b['special_shows'], 'seats': b['special_seats']}
               for k, b in sorted(buckets.items(), key=lambda kv: -kv[1]['special_seats'])
               if b['special_shows'] > 0]

    # ⑤ 계열사별 세부 현황 — 행: 계열사 / 열: 작품(순위순)
    movie_titles = [title_of[k] for k, _ in ordered]
    present = set()
    for _, b in ordered:
        present.update(b['brand'].keys())
    brand_rows = []
    for bd in [c for c in CHAIN_ORDER if c in present]:
        cells = [{'seats': b['brand'].get(bd, 0),
                  'share': round(b['brand'].get(bd, 0) / b['seats'] * 100, 1) if b['seats'] else 0.0}
                 for _, b in ordered]
        brand_rows.append({'brand': bd, 'cells': cells})

    return {'summary': summary, 'regions': regions, 'golden': golden,
            'special': special, 'by_brand': {'movies': movie_titles, 'rows': brand_rows}}


def build_competitor_data(d_from, d_to, titles=None, brands=None):
    """T003: 경쟁작 기간 합산 + 일별 탭 데이터 (최대 7일).

    숫자는 엑셀 비교표와 동일해야 하므로 작품별로 _process_to_rows 를 거친다.
    """
    from crawler.models import MovieSchedule

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

    maps = _build_maps()

    # 작품별 매칭 제목 (엑셀과 같은 title_matches 규칙)
    all_titles = list(MovieSchedule.objects.filter(play_date__in=cur_dates)
                      .values_list('movie_title', flat=True).distinct())

    sum_buckets = defaultdict(_empty_movie)
    day_buckets = defaultdict(lambda: defaultdict(_empty_movie))

    for u in units:
        matched = [t for t in all_titles if MovieSchedule.title_matches(u['title'], t)]
        if not matched:
            continue
        for d, rows in _rows_by_date(matched, cur_dates, maps, brands=brands).items():
            for r in rows:
                _acc_movie(sum_buckets[u['key']], r)
                _acc_movie(day_buckets[d][u['key']], r)

    if not sum_buckets:
        raise ValueError("해당 기간에 수집된 경쟁작 시간표 데이터가 없습니다.")

    empty_tab = {'summary': [], 'regions': [], 'golden': [], 'special': [],
                 'by_brand': {'movies': [], 'rows': []}}
    tabs = [{'key': 'sum', 'label': f"기간 합산 ({n_days}일)",
             **_competitor_sections(sum_buckets, title_of)}]
    for d in cur_dates:
        b = day_buckets.get(d, {})
        tabs.append({'key': str(d), 'label': _date_label(d),
                     **(_competitor_sections(b, title_of) if b else empty_tab)})

    from .views import _last_crawled_str

    return {
        'meta': {
            'date_from': str(d_from), 'date_to': str(d_to),
            'movie_count': len(sum_buckets),
            'last_crawled_at': _last_crawled_str(d_to),
        },
        'tabs': tabs,
    }
