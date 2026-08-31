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
- T001(주요작 시간표)은 [크롤러 관리] **보고서**(crawler/report/aggregation.py)와 같은 정의
  → 극장수 = 기간 전체 고유 (브랜드,극장) / 스크린수 = 일자별 고유 (극장+관)의 합
- T003(경쟁작)은 엑셀 **비교표**(_calc_summary)와 같은 정의
  → 극장수 = 고유 (브랜드,극장) / 스크린수 = 행 수(더빙·자막 분리 포함)
"""
import re
from collections import defaultdict
from datetime import timedelta

from castingline_backend.utils.ordering import REGION_ORDER

# 계열사 표기·순서 (기존 주요작 시간표와 동일)
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
# T001: 주요작 시간표 (B002/0829 개편 — 일자별 탭)
# =====================================================================
#
# 화면 구성(요청 B002):
#   일자별 탭(최대 7일) → 각 탭마다
#     ① KEY SUMMARY (해당 일자 + 전일比 / 전주比 증감)
#     ② 멀티사별 상세 현황   ③ 포맷별 상세 현황
#     ④ 시간대별 상세 현황   ⑤ 지역별 상세 현황
#     ⑥ 주요작 vs 경쟁작 (동시 상영 경쟁작 TOP 10 순위)
#   그리고 기간 전체를 관통하는 '상영일자 추이' 그래프.
#
# 전일比는 '해당 일자 - 1일', 전주比는 '해당 일자 - 7일'(같은 요일)과 비교한다.
# 그래서 집계 대상 날짜는 조회 기간 + 각 날짜의 -1일 · -7일을 모두 포함한다.

# V003(0831): 시간대 구분 — 당사 요약보고서 표준 기준 (회차 시작시각 기준).
# 자정 이후 새벽 회차는 심야로 본다.
TIME_SLOTS = [
    ('조조 (05~10시)', lambda h: 5 <= h < 10),
    ('오전 (10~12시)', lambda h: 10 <= h < 12),
    ('오후 (12~17시)', lambda h: 12 <= h < 17),
    ('저녁/프라임 (17~21시)', lambda h: 17 <= h < 21),
    ('심야 (21~24시·새벽)', lambda h: h >= 21 or h < 5),
]

# 시간표 조회 기간 상한 (경쟁작 화면과 동일 — 일자별 탭이 최대 7개)
MAX_TIMETABLE_DAYS = 7


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


def _format_label(fmt):
    """포맷 표기: 2D는 '2D (일반관)', 나머지(IMAX/4DX/DOLBY 등)는 태그 그대로."""
    f = (str(fmt or '').strip() or '2D')
    return '2D (일반관)' if f.upper() == '2D' else f


def _empty_day():
    return {
        'total': _empty(),
        'by_multi': defaultdict(_empty),
        'by_format': defaultdict(_empty),
        'by_region': defaultdict(_empty),
        'by_slot': [{'shows': 0, 'seats': 0, 'sold': 0} for _ in TIME_SLOTS],
    }


def _slot_index(hour):
    for i, (_, test) in enumerate(TIME_SLOTS):
        if test(hour):
            return i
    return len(TIME_SLOTS) - 1


def _collect_days(titles, dates, maps, brands=None):
    """{상영일: 그 날의 집계 묶음} — 멀티사·포맷·지역·시간대까지 한 번에 센다."""
    rows_by_date = _rows_by_date(titles, dates, maps, brands=brands)

    out = {}
    for d, rows in rows_by_date.items():
        bucket = _empty_day()
        for r in rows:
            _acc(bucket['total'], r, d)
            _acc(bucket['by_multi'][BRAND_DISPLAY.get(r['brand'], r['brand'])], r, d)
            _acc(bucket['by_format'][_format_label(r.get('format'))], r, d)
            _acc(bucket['by_region'][_region_of(r)], r, d)
            # 회차 단위 지표는 전처리가 준 회차별 상세로만 계산한다 (자체 계산 금지)
            for sh in r.get('shows', []):
                s = bucket['by_slot'][_slot_index(sh['hour'])]
                s['shows'] += 1
                s['seats'] += sh['seats']
                s['sold'] += sh['sold']
        out[d] = bucket
    return out


def _diff_or_none(cur, prev_bucket, getter):
    """전일/전주 데이터가 아예 없으면 None(화면에서 '-')을 돌려준다."""
    if prev_bucket is None:
        return None
    return {'diff': cur - getter(prev_bucket)}


def _detail_rows(by_key, prev_map, week_map, order, day_total_seats, count_field):
    """② 멀티사별 / ③ 포맷별 / ⑤ 지역별 공통 행 생성.

    각 행: 총 좌석수 · 비율 · 전일比 좌석 증감 · 전주比 좌석 증감 · 극장(또는 스크린)수 · 회차수
    """
    keys = [k for k in order if k in by_key]
    keys += sorted((k for k in by_key if k not in order),
                   key=lambda k: -by_key[k]['seats'])

    rows = []
    for k in keys:
        b = by_key[k]
        rows.append({
            'label': k,
            'total_seats': b['seats'],
            'share': round(b['seats'] / day_total_seats * 100, 1) if day_total_seats else 0.0,
            'prev_day_cmp': _diff_or_none(b['seats'], prev_map,
                                          lambda m, k=k: m.get(k, {}).get('seats', 0)),
            'prev_week_cmp': _diff_or_none(b['seats'], week_map,
                                           lambda m, k=k: m.get(k, {}).get('seats', 0)),
            'count': (len(b['theaters']) if count_field == 'theaters'
                      else len(b['day_screens'])),
            'shows': b['shows'],
        })
    return rows


def _slot_rows(cur_slots, prev_slots, week_slots):
    """④ 시간대별 상세 현황 — 점유율 차이는 %p."""
    rows = []
    for i, (label, _) in enumerate(TIME_SLOTS):
        s = cur_slots[i]
        occ = _occ(s['sold'], s['seats'])
        row = {
            'label': label,
            'shows': s['shows'],
            'total_seats': s['seats'],
            'sold_seats': s['sold'],
            'occupancy': occ,
            'prev_day_cmp': None,
            'prev_week_cmp': None,
        }
        if prev_slots is not None:
            p = prev_slots[i]
            row['prev_day_cmp'] = {'diff': round(occ - _occ(p['sold'], p['seats']), 1)}
        if week_slots is not None:
            w = week_slots[i]
            row['prev_week_cmp'] = {'diff': round(occ - _occ(w['sold'], w['seats']), 1)}
        rows.append(row)
    return rows


def _competitor_units(main_title):
    """⑥ 동시 상영 경쟁작 TOP 10 대상 — 활성 크롤 대상 전체 + 조회 중인 주요작."""
    from crawler.models import CrawlTargetMovie, MovieSchedule

    units, seen = [], set()

    def push(raw_title):
        clean, _ = MovieSchedule.parse_and_normalize_title(raw_title)
        key = MovieSchedule.normalize_title(clean)
        if not key or key in seen:
            return key
        seen.add(key)
        units.append({'key': key, 'title': clean or raw_title})
        return key

    main_key = push(main_title) if main_title else None
    for t in CrawlTargetMovie.objects.filter(is_active=True).order_by('id'):
        push(t.title)
    return units, main_key


def _competitor_by_day(units, dates, maps):
    """{상영일: {작품키: {seats, sold, shows}}} — 엑셀과 같은 전처리로 집계."""
    from crawler.models import MovieSchedule

    all_titles = list(MovieSchedule.objects.filter(play_date__in=list(dates))
                      .values_list('movie_title', flat=True).distinct())

    out = defaultdict(dict)
    for u in units:
        matched = [t for t in all_titles if MovieSchedule.title_matches(u['title'], t)]
        if not matched:
            continue
        for d, rows in _rows_by_date(matched, dates, maps).items():
            b = {'seats': 0, 'sold': 0, 'shows': 0}
            for r in rows:
                b['seats'] += r['total_seats']
                b['sold'] += r['sold_seats']
                b['shows'] += r['show_count']
            if b['seats'] or b['shows']:
                out[d][u['key']] = b
    return out


def _ranks_of(day_map):
    """그 날의 총 좌석수 내림차순 순위 (동률은 RANK — 1,2,2,4)."""
    ranks, prev_val, prev_rank = {}, None, 0
    for i, (key, b) in enumerate(sorted(day_map.items(), key=lambda kv: -kv[1]['seats']), 1):
        rank = prev_rank if b['seats'] == prev_val else i
        ranks[key] = rank
        prev_val, prev_rank = b['seats'], rank
    return ranks


def _competitor_top(day_map, prev_map, week_map, title_of, main_key, top_n=10):
    """⑥ 동시 상영 경쟁작 TOP 10 (+ TOP10 밖이면 주요작 행을 덧붙인다)."""
    if not day_map:
        return []
    ranks = _ranks_of(day_map)
    prev_ranks = _ranks_of(prev_map) if prev_map else {}
    week_ranks = _ranks_of(week_map) if week_map else {}

    ordered = sorted(day_map.items(), key=lambda kv: -kv[1]['seats'])
    picked = ordered[:top_n]
    if main_key and main_key in day_map and all(k != main_key for k, _ in picked):
        picked = picked + [(main_key, day_map[main_key])]

    def rank_move(prev_rank, cur_rank):
        # 순위가 오르면 양수(▲), 내리면 음수(▼). 비교 대상이 없으면 None → '-'
        return None if prev_rank is None else prev_rank - cur_rank

    rows = []
    for key, b in picked:
        rows.append({
            'rank': ranks[key],
            'title': title_of.get(key, key),
            'is_main': key == main_key,
            'total_seats': b['seats'],
            'occupancy': _occ(b['sold'], b['seats']),
            'shows': b['shows'],
            'prev_day_move': rank_move(prev_ranks.get(key), ranks[key]),
            'prev_week_move': rank_move(week_ranks.get(key), ranks[key]),
        })
    return rows


def build_timetable_data(movie, d_from, d_to):
    """T001(B002): 주요작 시간표 화면 데이터 — 일자별 탭 + 상영일자 추이."""
    n_days = (d_to - d_from).days + 1
    if n_days < 1:
        raise ValueError("종료일이 시작일보다 빠릅니다.")
    if n_days > MAX_TIMETABLE_DAYS:
        raise ValueError(
            f"시간표 조회 기간은 최대 {MAX_TIMETABLE_DAYS}일까지 지정할 수 있습니다.")

    cur_dates = [d_from + timedelta(days=i) for i in range(n_days)]
    prev_day_of = {d: d - timedelta(days=1) for d in cur_dates}
    prev_week_of = {d: d - timedelta(days=7) for d in cur_dates}
    # 전일比·전주比를 위해 -1일, -7일 데이터도 함께 집계한다
    all_dates = sorted(set(cur_dates)
                       | set(prev_day_of.values())
                       | set(prev_week_of.values()))

    matched_titles = _match_titles(movie.title_ko)
    maps = _build_maps()

    days = _collect_days(matched_titles, all_dates, maps)

    # ⑥ 동시 상영 경쟁작 순위 (주요작 포함 — 같은 전처리라 숫자가 어긋나지 않는다)
    units, main_key = _competitor_units(movie.title_ko)
    title_of = {u['key']: u['title'] for u in units}
    comp_days = _competitor_by_day(units, all_dates, maps)

    # 주요작 행은 화면의 다른 표와 **같은 매칭 규칙**(_match_titles)으로 낸 수치로 덮어쓴다.
    # 경쟁작 순위는 title_matches(정확 일치)로 집계하는데, 두 규칙이 갈리는 제목이면
    # 같은 화면 안에서 주요작 좌석수가 표마다 달라 보이기 때문이다.
    if main_key:
        for d in all_dates:
            b = days.get(d)
            if b and b['total']['seats']:
                comp_days[d][main_key] = {'seats': b['total']['seats'],
                                          'sold': b['total']['sold'],
                                          'shows': b['total']['shows']}
            else:
                comp_days.get(d, {}).pop(main_key, None)

    tabs = []
    for d in cur_dates:
        cur = days.get(d)
        prev = days.get(prev_day_of[d])
        week = days.get(prev_week_of[d])

        cur_total = cur['total'] if cur else _empty()
        kpi = _kpis(cur_total)
        summary = {
            'date': str(d),
            'label': _date_label(d),
            'prev_day': str(prev_day_of[d]),
            'prev_week': str(prev_week_of[d]),
            **kpi,
            'prev_day_cmp': None,
            'prev_week_cmp': None,
        }
        for slot, other in (('prev_day_cmp', prev), ('prev_week_cmp', week)):
            if not other:
                continue
            p = _kpis(other['total'])
            summary[slot] = {
                'total_seats': _cmp_num(kpi['total_seats'], p['total_seats']),
                'sold_seats': _cmp_num(kpi['sold_seats'], p['sold_seats']),
                'occupancy': {'diff': round(kpi['occupancy'] - p['occupancy'], 1)},
                'shows': _cmp_num(kpi['shows'], p['shows']),
                'theaters': _cmp_num(kpi['theaters'], p['theaters']),
                'screens': _cmp_num(kpi['screens'], p['screens']),
            }

        day_seats = cur_total['seats']
        empty_bucket = {}
        tabs.append({
            'key': str(d),
            'label': _date_label(d),
            'key_summary': summary,
            'multi_detail': _detail_rows(
                cur['by_multi'] if cur else empty_bucket,
                prev['by_multi'] if prev else None,
                week['by_multi'] if week else None,
                CHAIN_ORDER, day_seats, 'theaters'),
            'format_detail': _detail_rows(
                cur['by_format'] if cur else empty_bucket,
                prev['by_format'] if prev else None,
                week['by_format'] if week else None,
                ['2D (일반관)'], day_seats, 'screens'),
            'time_detail': _slot_rows(
                cur['by_slot'] if cur else _empty_day()['by_slot'],
                prev['by_slot'] if prev else None,
                week['by_slot'] if week else None),
            'region_detail': _detail_rows(
                cur['by_region'] if cur else empty_bucket,
                prev['by_region'] if prev else None,
                week['by_region'] if week else None,
                REGION_DISPLAY_ORDER, day_seats, 'theaters'),
            'competitor_top': _competitor_top(
                comp_days.get(d, {}),
                comp_days.get(prev_day_of[d], {}),
                comp_days.get(prev_week_of[d], {}),
                title_of, main_key),
        })

    # ---- 상영일자 추이 (금주 실선 / 전주 점선) ----
    has_prev = any(days.get(prev_week_of[d]) for d in cur_dates)
    points = []
    for d in cur_dates:
        cur = days.get(d)
        week = days.get(prev_week_of[d])
        points.append({
            'date': str(d), 'label': _date_label(d),
            'prev_date': str(prev_week_of[d]),
            'cur': _kpis(cur['total']) if cur else _kpis(_empty()),
            'prev': _kpis(week['total']) if week else None,
        })
    trend = {
        'dates': [str(d) for d in cur_dates],
        'prev_dates': [str(prev_week_of[d]) for d in cur_dates],
        'points': points,
        'compare_note': ', '.join(
            f"{d.month}/{d.day}↔{prev_week_of[d].month}/{prev_week_of[d].day}"
            for d in cur_dates),
    }

    from .views import _last_crawled_str

    return {
        'meta': {
            'movie_title': movie.title_ko,
            'release_date': str(movie.release_date) if movie.release_date else None,
            'distributor_name': movie.distributor.client_name if movie.distributor else None,
            'last_crawled_at': _last_crawled_str(d_to, titles=matched_titles),
            'date_from': str(d_from), 'date_to': str(d_to),
            'prev_from': str(prev_week_of[cur_dates[0]]),
            'prev_to': str(prev_week_of[cur_dates[-1]]),
            'has_prev': has_prev,
        },
        'tabs': tabs,
        'trend': trend,
    }


# =====================================================================
# T003: 경쟁작
# =====================================================================

# V004(0831): 특별관 '합계' 대신 타입별 개별 집계 — (표시명, 매칭 태그 키워드).
# Dolby Atmos 표기는 DOLBY/ATMOS 어느 쪽으로 와도 Dolby로 묶는다.
SPECIAL_FORMAT_COLUMNS = [
    ('IMAX', ('IMAX',)),
    ('4DX', ('4DX',)),
    ('SCREENX', ('SCREENX',)),
    ('Dolby', ('DOLBY', 'ATMOS')),
]
GOLDEN_START, GOLDEN_END = 14, 21   # 골든타임 14~21시 (시작시각 기준)


def _special_formats_of(tags):
    """회차 태그가 해당하는 특별관 표시명 목록 (없으면 빈 리스트)."""
    uppers = [str(t).upper() for t in (tags or [])]
    return [name for name, kws in SPECIAL_FORMAT_COLUMNS
            if any(k in tu for tu in uppers for k in kws)]


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
        'special_fmt': {name: {'shows': 0, 'seats': 0}
                        for name, _ in SPECIAL_FORMAT_COLUMNS},
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
        # V004: 타입별 개별 집계 (IMAX+Dolby 겸용관처럼 복수 타입이면 각각 집계)
        for name in _special_formats_of(sh['tags']):
            f = b['special_fmt'][name]
            f['shows'] += 1
            f['seats'] += sh['seats']


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

    # ④ 특별관 — V004(0831): 합계 제거, 타입별(IMAX/4DX/SCREENX/Dolby) 개별 표
    special = []
    for name, _ in SPECIAL_FORMAT_COLUMNS:
        fmt_rows = [{'title': title_of[k],
                     'shows': b['special_fmt'][name]['shows'],
                     'seats': b['special_fmt'][name]['seats']}
                    for k, b in buckets.items()
                    if b['special_fmt'][name]['shows'] > 0]
        fmt_rows.sort(key=lambda r: -r['seats'])
        if fmt_rows:
            special.append({'format': name, 'rows': fmt_rows})

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
    """T003: 경쟁작 일별 탭 데이터 (최대 7일 · B003으로 기간 합산 탭 제거).

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
    # B003(0829): '기간 합산' 탭 삭제 — 각 일자별 뷰만 남긴다
    tabs = []
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
