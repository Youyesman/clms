# -*- coding: utf-8 -*-
"""P001: 영화 상영현황 보고서 — 데이터 집계 엔진.

[시간표 수집] DB(MovieSchedule)에 이미 쌓인 데이터를 읽어 보고서용 ViewModel을
만든다. PDF/엑셀 렌더러는 이 ViewModel 하나를 공유하므로 두 출력물의 숫자가
절대 달라지지 않는다. (개발요청서 §23·§25)

집계 규칙 (개발요청서 §9):
- 총 좌석수/예매좌석수/회차수 = 조사기간(기본 3일) 합계
- 좌석점유율 = SUM(예매좌석수) ÷ SUM(총좌석수) — 비율 평균 금지
- 극장수 = 조사기간 전체의 고유 극장 수 (같은 극장이 3일 나와도 1개)
- 스크린수 = 일자별 고유 (극장+관) 수를 날짜별로 센 뒤 합산
- 판매좌석수는 보고서에서 '예매좌석수'로 표기 (표시명만 변경)
- 전주 = 기준기간에서 정확히 7일 전의 동일 구간
- 순위 동률은 RANK(competition ranking: 1,2,2,4) 방식

W002: 숫자의 출처는 [크롤러 관리]의 엑셀 다운로드와 **완전히 동일**해야 한다.
그래서 원본 MovieSchedule 행을 직접 세지 않고, 엑셀과 같은 전처리
(excel_exporter._process_to_rows — 씨네드쉐프 중복 정리, 일반극장 극장/좌석 매칭,
좌석 정보 없는 회차의 정원 보정)를 거친 행으로 집계한다. 계열사(brands) 선택도
엑셀 다운로드와 같은 범위로 받는다.

C001: 작품 배정도 엑셀과 같은 '작품별 독립 매칭'이다. 그래서 주요작 지정
여부(보고서 유형)와 무관하게 같은 작품은 항상 같은 숫자가 나온다.
(V003: title_matches 가 '특수문자·공백 제외 정확 일치'로 바뀌어, 예전처럼
'오디세이 + 스파이더맨' 같은 동시상영 합성 제목이 두 작품에 걸쳐 잡히는 일은
없어졌다 — 합성 제목은 어느 작품과도 일치하지 않아 집계에서 빠진다.)
"""
from collections import defaultdict
from datetime import timedelta

from castingline_backend.utils.ordering import REGION_ORDER
from crawler.models import MovieSchedule, CrawlTargetMovie

# 보고서가 구분하는 멀티(체인). 그 외(일반극장 등)는 '기타'로 묶는다. (§7)
MULTI_LABEL = {"CGV": "CGV", "LOTTE": "롯데", "MEGABOX": "메가박스"}
MULTI_ORDER = ["CGV", "롯데", "메가박스", "기타"]

# A001(0829): 지역별 상세 현황 표기 순서 (그 외 지역은 '기타'로 묶어 맨 뒤)
REGION_DISPLAY_ORDER = list(REGION_ORDER) + ["기타"]


def _region_label(region):
    return region if region in REGION_ORDER else "기타"


def _format_label(fmt):
    """포맷 표기 — 태그가 없으면 2D."""
    return (str(fmt or "").strip() or "2D")

# M001 P.4: 주요 시간대 구분 (회차 시작시각 기준)
DAY_SLOTS = [
    ("조조 (05~10시)", 5, 10),
    ("오전 (10~12시)", 10, 12),
    ("오후 (12~17시)", 12, 17),
    ("저녁/프라임 (17~21시)", 17, 21),
    ("심야 (21~24시)", 21, 24),
]


def _slot_index(hhmm):
    """'HH:MM' → DAY_SLOTS 인덱스. 자정 이후 새벽 회차는 심야로 본다."""
    try:
        h = int(str(hhmm).split(":")[0])
    except (ValueError, IndexError):
        return None
    if h < 5:
        return len(DAY_SLOTS) - 1
    for i, (_, lo, hi) in enumerate(DAY_SLOTS):
        if lo <= h < hi:
            return i
    return len(DAY_SLOTS) - 1


def _brand_to_multi(brand):
    return MULTI_LABEL.get((brand or "").upper(), "기타")


class _Agg:
    """한 단위(작품/멀티/극장)의 KPI 누적기."""

    __slots__ = ("total", "sold", "shows", "theaters", "day_screens")

    def __init__(self):
        self.total = 0          # 총 좌석수
        self.sold = 0           # 예매(판매)좌석수
        self.shows = 0          # 회차수
        self.theaters = set()   # (brand, theater) — 고유 극장
        self.day_screens = set()  # (date, brand, theater, screen) — 일자별 스크린

    def add(self, row, play_date):
        """엑셀(_process_to_rows)이 만든 (극장+관+일자) 단위 행 하나를 누적."""
        self.total += row["total_seats"]
        self.sold += row["sold_seats"]
        self.shows += row["show_count"]
        self.theaters.add((row["brand"], row["theater"]))
        self.day_screens.add((play_date, row["brand"], row["theater"], row["screen"]))

    # ---- 산출 KPI ----
    @property
    def theater_count(self):
        return len(self.theaters)

    @property
    def screen_count(self):
        # 일자별 DISTINCT(극장+관) 후 합산과 동일 (집합 원소에 날짜가 포함되므로)
        return len(self.day_screens)

    @property
    def occupancy(self):
        return (self.sold / self.total * 100) if self.total > 0 else 0.0


def _movie_units(main_title=None, competitors=None):
    """크롤 대상 영화 → 보고서 작품 단위 목록.

    같은 작품이 주요작/경쟁작으로 중복 등록돼 있어도(§5) 정규화 제목 기준으로
    한 번만 집계한다. 주요작(main_title)이 지정되면 목록 맨 앞에 둔다.

    C004(0827): competitors(경쟁작 다중 선택 제목 목록)가 주어지면 활성 크롤
    대상 중 그 작품들만 집계 단위로 삼는다 (엑셀 다운로드의 경쟁작 선택과 동일).
    미지정이면 기존처럼 활성 크롤 대상 전체.
    """
    units = []       # [{key, title}]
    seen = set()

    def push(raw_title):
        clean, _ = MovieSchedule.parse_and_normalize_title(raw_title)
        key = MovieSchedule.normalize_title(clean)
        if not key or key in seen:
            return
        seen.add(key)
        units.append({"key": key, "title": clean})

    comp_keys = None
    if competitors:
        comp_keys = set()
        for c in competitors:
            clean, _ = MovieSchedule.parse_and_normalize_title(c)
            k = MovieSchedule.normalize_title(clean)
            if k:
                comp_keys.add(k)

    if main_title:
        push(main_title)
    for t in CrawlTargetMovie.objects.filter(is_active=True).order_by("id"):
        if comp_keys is not None:
            clean, _ = MovieSchedule.parse_and_normalize_title(t.title)
            if MovieSchedule.normalize_title(clean) not in comp_keys:
                continue
        push(t.title)

    main_key = None
    if main_title:
        clean, _ = MovieSchedule.parse_and_normalize_title(main_title)
        main_key = MovieSchedule.normalize_title(clean)
    return units, main_key


def _collect(date_list, units, brands=None, maps=None):
    """대상 상영일들의 MovieSchedule 을 작품 단위로 배정해 집계한다.

    date_list: 상영일 목록 — 연속 기간이면 그 범위의 모든 날짜, 특정 날짜
    선택(C008)이면 그 날짜들만. play_date IN 필터라 비연속도 그대로 동작한다.

    엑셀 다운로드와 같은 숫자가 나오도록, 원본 행을 직접 세지 않고
    excel_exporter._process_to_rows 로 (일자·극장·관) 단위 행을 만든 뒤 누적한다.

    반환:
      by_movie:  key -> _Agg
      by_multi:  (movie_key, multi) -> _Agg
      by_theater: (movie_key, (brand, 표시극장명)) -> _Agg
      grand_theaters / grand_day_screens: 전체(작품 무관) 고유 극장·스크린 (§B-2)
    """
    from crawler.utils.excel_exporter import _process_to_rows

    region_map, normal_index = maps

    qs = MovieSchedule.objects.filter(play_date__in=list(date_list))
    if brands:
        qs = qs.filter(brand__in=brands)

    by_movie = defaultdict(_Agg)
    by_multi = defaultdict(_Agg)
    by_theater = defaultdict(_Agg)
    by_movie_day = defaultdict(_Agg)          # (key, date) — M001 P.4 일별 비교
    # A001(0829): 포맷별·지역별 상세 현황 — 기간 합계와 일자별 좌석수를 함께 센다
    by_format = defaultdict(_Agg)             # (key, 포맷) -> _Agg
    by_format_day = defaultdict(int)          # (key, 포맷, date) -> 총 좌석수
    by_region = defaultdict(_Agg)             # (key, 지역) -> _Agg
    by_region_day = defaultdict(int)          # (key, 지역, date) -> 총 좌석수
    day_slot_shows = defaultdict(lambda: defaultdict(int))  # (key, date) -> slot -> 회차수
    grand_theaters = set()
    grand_day_screens = set()

    # 같은 제목 문자열은 매번 다시 매칭하지 않도록 캐시
    title_cache = {}

    def match_units(raw_title):
        """C001: 엑셀 다운로드와 동일하게 '작품별 독립 매칭'.

        엑셀은 작품마다 따로 title_matches 로 필터링하므로 보고서도 같은 규칙을
        써야 숫자가 어긋나지 않는다. (예전처럼 첫 매칭 작품 하나에만 배정하면,
        주요작 지정 여부에 따라 매칭 순서가 달라져 같은 작품의 수치가
        보고서 유형별로 달라졌다. V003 이후 title_matches 는 정확 일치라
        한 제목이 여러 작품에 걸리는 일은 사실상 없다.)
        """
        if raw_title in title_cache:
            return title_cache[raw_title]
        matched = [u["key"] for u in units
                   if MovieSchedule.title_matches(u["title"], raw_title)]
        title_cache[raw_title] = matched
        return matched

    dates = sorted(qs.values_list("play_date", flat=True).distinct())

    # 날짜별로 나눠 처리한다 — 엑셀도 시트(=일자) 단위로 같은 전처리를 하며,
    # 기간 전체를 한 번에 메모리에 올리지 않아도 된다.
    for play_date in dates:
        day_qs = qs.filter(play_date=play_date).only(
            "brand", "theater_name", "screen_name", "movie_title",
            "total_seats", "remaining_seats", "play_date", "start_time", "tags",
        )
        buckets = defaultdict(list)
        for sch in day_qs:
            # 크롤 대상 외(타 영화 특수상영 등)는 보고서 제외
            for key in match_units(sch.movie_title):
                buckets[key].append(sch)

        for key, schedules in buckets.items():
            rows, _ = _process_to_rows(schedules, region_map, normal_index)
            for r in rows:
                by_movie[key].add(r, play_date)
                by_multi[(key, _brand_to_multi(r["brand"]))].add(r, play_date)
                by_theater[(key, (r["brand"], r["theater"]))].add(r, play_date)
                by_movie_day[(key, play_date)].add(r, play_date)
                fmt_lbl = _format_label(r.get("format"))
                by_format[(key, fmt_lbl)].add(r, play_date)
                by_format_day[(key, fmt_lbl, play_date)] += r["total_seats"]
                reg_lbl = _region_label(r.get("region"))
                by_region[(key, reg_lbl)].add(r, play_date)
                by_region_day[(key, reg_lbl, play_date)] += r["total_seats"]
                # M001 P.4 ③: 회차 시작시각을 시간대로 분류
                for t in r.get("show_times", []):
                    si = _slot_index(t) if t else None
                    if si is not None:
                        day_slot_shows[(key, play_date)][si] += 1
                grand_theaters.add((r["brand"], r["theater"]))
                grand_day_screens.add((play_date, r["brand"], r["theater"], r["screen"]))

    return {
        "by_movie": by_movie,
        "by_multi": by_multi,
        "by_theater": by_theater,
        "by_movie_day": by_movie_day,
        "by_format": by_format,
        "by_format_day": by_format_day,
        "by_region": by_region,
        "by_region_day": by_region_day,
        "day_slot_shows": day_slot_shows,
        "grand_theaters": grand_theaters,
        "grand_day_screens": grand_day_screens,
    }


def _rank_maps(by_movie):
    """작품별 KPI 순위(RANK — 동률 시 1,2,2,4). key -> {metric: rank}"""
    metrics = {
        "seats": lambda a: a.total,
        "reserved": lambda a: a.sold,
        "occupancy": lambda a: a.occupancy,
        "shows": lambda a: a.shows,
    }
    ranks = defaultdict(dict)
    for m, fn in metrics.items():
        ordered = sorted(by_movie.items(), key=lambda kv: -fn(kv[1]))
        prev_val = None
        prev_rank = 0
        for i, (key, agg) in enumerate(ordered, 1):
            val = fn(agg)
            rank = prev_rank if val == prev_val else i
            ranks[key][m] = rank
            prev_val, prev_rank = val, rank
    return ranks


def _cmp(cur, prev, has_prev_period, unit=""):
    """전주 비교 dict. prev가 None이면 신규(전주 데이터 없음)."""
    if not has_prev_period:
        return {"kind": "none"}          # 전주 기간 자체에 데이터 없음 → '-'
    if prev is None:
        return {"kind": "new"}           # 이번 주 신규 작품 → '신규'
    diff = cur - prev
    rate = (diff / prev * 100) if prev else None
    return {"kind": "cmp", "diff": diff, "rate": rate, "unit": unit}


def _occ_cmp(cur, prev, has_prev_period):
    if not has_prev_period:
        return {"kind": "none"}
    if prev is None:
        return {"kind": "new"}
    return {"kind": "occ", "diff": cur - prev}


def _movie_summary(key, title, agg, is_main=False):
    return {
        "key": key,
        "title": title,
        "is_main": is_main,
        "total_seats": agg.total,
        "reserved": agg.sold,
        "occupancy": agg.occupancy,
        "shows": agg.shows,
        "theaters": agg.theater_count,
        "screens": agg.screen_count,
    }


def build_report_data(start_date, end_date, main_title=None, brands=None, dates=None,
                      competitors=None):
    """보고서 ViewModel 생성. main_title이 없으면 '주요작 없음' 모드.

    brands: 엑셀 다운로드와 같은 계열사 필터(["CGV","LOTTE","MEGABOX","일반극장"]).
            None이면 전체.
    dates:  C008 — 특정 날짜(비연속 다중 선택) 목록. 지정 시 그 날짜들만 집계하고
            전주 비교도 각 날짜의 정확히 7일 전(같은 요일)으로 잡는다.
    competitors: C004(0827) — 경쟁작 다중 선택 제목 목록. 지정 시 그 작품(+주요작)만
            집계, 미지정이면 활성 크롤 대상 전체.
    """
    from crawler.utils.excel_exporter import _build_region_map, _build_normal_theater_index

    if dates:
        cur_dates = sorted(set(dates))
        start_date, end_date = cur_dates[0], cur_dates[-1]
    else:
        cur_dates = [start_date + timedelta(days=i)
                     for i in range((end_date - start_date).days + 1)]
    prev_dates = [d - timedelta(days=7) for d in cur_dates]
    prev_start, prev_end = prev_dates[0], prev_dates[-1]

    units, main_key = _movie_units(main_title, competitors=competitors)
    if not units:
        raise ValueError("크롤 대상 영화가 없습니다. [크롤러 관리]에서 먼저 등록하세요.")

    # 지역/일반극장 인덱스는 비싸므로 기준기간·전주에서 한 번만 만들어 공유한다
    maps = (_build_region_map(), _build_normal_theater_index())

    cur = _collect(cur_dates, units, brands=brands, maps=maps)
    prev = _collect(prev_dates, units, brands=brands, maps=maps)

    by_movie = cur["by_movie"]
    if not by_movie:
        raise ValueError("해당 기간에 수집된 시간표 데이터가 없습니다.")
    if main_key and main_key not in by_movie:
        raise ValueError("해당 기간에 주요작의 시간표 데이터가 없습니다.")

    prev_by_movie = prev["by_movie"]
    has_prev = bool(prev_by_movie)

    title_of = {u["key"]: u["title"] for u in units}
    ranks = _rank_maps(by_movie)
    prev_ranks = _rank_maps(prev_by_movie) if has_prev else {}

    # ---- 작품별 요약 (총 좌석수 내림차순) + 점유비중(§A-9) ----
    grand_total_seats = sum(a.total for a in by_movie.values())
    movies = []
    for key, agg in sorted(by_movie.items(), key=lambda kv: -kv[1].total):
        s = _movie_summary(key, title_of[key], agg, is_main=(key == main_key))
        s["share"] = (agg.total / grand_total_seats * 100) if grand_total_seats else 0.0
        p = prev_by_movie.get(key)
        s["seats_cmp"] = _cmp(agg.total, p.total if p else None, has_prev, unit="석")
        movies.append(s)

    data = {
        "mode": "main" if main_key else "none",
        "period": {"start": start_date, "end": end_date,
                   "prev_start": prev_start, "prev_end": prev_end,
                   # C008: 특정 날짜 선택 시 실제 대상 날짜 목록 (렌더러가 나열 표기)
                   "dates": cur_dates if dates else None,
                   "prev_dates": prev_dates if dates else None},
        "has_prev": has_prev,
        "movie_count": len(movies),
        "movies": movies,
    }

    if main_key:
        # ================= A. 주요작 있는 버전 =================
        agg = by_movie[main_key]
        p_agg = prev_by_movie.get(main_key)
        main = _movie_summary(main_key, title_of[main_key], agg, is_main=True)
        main["kpi_cmp"] = {
            "total_seats": _cmp(agg.total, p_agg.total if p_agg else None, has_prev, "석"),
            "reserved": _cmp(agg.sold, p_agg.sold if p_agg else None, has_prev, "석"),
            "occupancy": _occ_cmp(agg.occupancy, p_agg.occupancy if p_agg else None, has_prev),
            "shows": _cmp(agg.shows, p_agg.shows if p_agg else None, has_prev, "회"),
            "theaters": _cmp(agg.theater_count, p_agg.theater_count if p_agg else None, has_prev, "개"),
            "screens": _cmp(agg.screen_count, p_agg.screen_count if p_agg else None, has_prev, "개"),
        }
        # 경쟁 포지션: 4개 지표 순위 + 전주 순위 (§A-6 — 전주 전체 순위를 다시 계산)
        main["ranks"] = {
            m: {"cur": ranks[main_key][m],
                "prev": prev_ranks.get(main_key, {}).get(m) if has_prev else None}
            for m in ("seats", "reserved", "occupancy", "shows")
        }
        data["main"] = main

        # ① 멀티별 현황 — 주요작 데이터만 (§A-3), 전주比는 총 좌석수만
        multis = []
        for multi in MULTI_ORDER:
            a = cur["by_multi"].get((main_key, multi))
            # 좌석 정보가 없는 체인(일반극장 등 총좌석 0)은 표에서 제외 — 샘플 디자인 기준 3개 멀티
            if not a or a.total <= 0:
                continue
            pa = prev["by_multi"].get((main_key, multi))
            multis.append({
                "name": multi,
                "total_seats": a.total,
                "seats_cmp": _cmp(a.total, pa.total if pa else None, has_prev, "석"),
                "reserved": a.sold,
                "occupancy": a.occupancy,
                "screens": a.screen_count,
                "theaters": a.theater_count,
                "shows": a.shows,
            })
        data["main_multis"] = multis

        # ② 총 좌석수 기준 극장 TOP10 (§A-4) — 전주比는 동일 극장의 전주 총 좌석수
        theaters = [
            (tkey, a) for (mk, tkey), a in cur["by_theater"].items() if mk == main_key
        ]
        theaters.sort(key=lambda kv: -kv[1].total)
        top10 = []
        for tkey, a in theaters[:10]:
            pa = prev["by_theater"].get((main_key, tkey))
            # 극장명은 엑셀과 같은 표시명(_process_to_rows 가 이미 정리해 둔 값)
            brand, display_name = tkey
            top10.append({
                "multi": _brand_to_multi(brand),
                "name": display_name,
                "total_seats": a.total,
                "seats_cmp": _cmp(a.total, pa.total if pa else None, has_prev, "석"),
                "reserved": a.sold,
                "occupancy": a.occupancy,
                "screens": a.screen_count,
                "shows": a.shows,
            })
        data["main_theaters_top10"] = top10

        # ③④ A001(0829): 포맷별 / 지역별 상세 현황
        #   열 = 일자별 (총 좌석수, 비중) + 합계 (총 좌석수, 비중) + 스크린/극장수 + 회차수
        #   비중 = 그 일자의 주요작 총 좌석수 대비. 마지막 '합계' 행은 주요작 전체값.
        day_totals = {}
        for d in cur_dates:
            a_day = cur["by_movie_day"].get((main_key, d))
            day_totals[d] = a_day.total if a_day else 0
        grand = agg.total

        def _breakdown(by_key, by_key_day, order, count_attr):
            labels = [k for (mk, k) in by_key if mk == main_key]
            ordered = [k for k in order if k in labels]
            ordered += sorted((k for k in labels if k not in order),
                              key=lambda k: -by_key[(main_key, k)].total)
            rows = []
            for lbl in ordered:
                a2 = by_key[(main_key, lbl)]
                rows.append({
                    "label": lbl,
                    "days": [{"seats": by_key_day.get((main_key, lbl, d), 0),
                              "share": (by_key_day.get((main_key, lbl, d), 0)
                                        / day_totals[d] * 100) if day_totals[d] else 0.0}
                             for d in cur_dates],
                    "total_seats": a2.total,
                    "total_share": (a2.total / grand * 100) if grand else 0.0,
                    "count": getattr(a2, count_attr),
                    "shows": a2.shows,
                })
            if rows:
                rows.append({
                    "label": "합계",
                    "days": [{"seats": day_totals[d],
                              "share": 100.0 if day_totals[d] else 0.0} for d in cur_dates],
                    "total_seats": grand,
                    "total_share": 100.0 if grand else 0.0,
                    "count": getattr(agg, count_attr),
                    "shows": agg.shows,
                    "is_total": True,
                })
            return {"dates": cur_dates, "count_label": ("스크린수" if count_attr == "screen_count"
                                                        else "극장수"), "rows": rows}

        data["main_formats"] = _breakdown(cur["by_format"], cur["by_format_day"],
                                          ["2D"], "screen_count")
        data["main_regions"] = _breakdown(cur["by_region"], cur["by_region_day"],
                                          REGION_DISPLAY_ORDER, "theater_count")
    else:
        # ================= B. 주요작 없는 버전 =================
        # KEY SUMMARY — 전체 조사작품 합계 (§B-2)
        t_total = sum(a.total for a in by_movie.values())
        t_sold = sum(a.sold for a in by_movie.values())
        t_shows = sum(a.shows for a in by_movie.values())
        t_theaters = len(cur["grand_theaters"])         # 작품별 극장수 합산 금지
        t_screens = len(cur["grand_day_screens"])
        t_occ = (t_sold / t_total * 100) if t_total else 0.0

        p_total = sum(a.total for a in prev_by_movie.values())
        p_sold = sum(a.sold for a in prev_by_movie.values())
        p_shows = sum(a.shows for a in prev_by_movie.values())
        p_theaters = len(prev["grand_theaters"])
        p_screens = len(prev["grand_day_screens"])
        p_occ = (p_sold / p_total * 100) if p_total else 0.0

        data["totals"] = {
            "movie_count": len(movies),
            "total_seats": t_total, "reserved": t_sold, "occupancy": t_occ,
            "shows": t_shows, "theaters": t_theaters, "screens": t_screens,
            "kpi_cmp": {
                "total_seats": _cmp(t_total, p_total if has_prev else None, has_prev, "석"),
                "reserved": _cmp(t_sold, p_sold if has_prev else None, has_prev, "석"),
                "occupancy": _occ_cmp(t_occ, p_occ if has_prev else None, has_prev),
                "shows": _cmp(t_shows, p_shows if has_prev else None, has_prev, "회"),
                "theaters": _cmp(t_theaters, p_theaters if has_prev else None, has_prev, "개"),
                "screens": _cmp(t_screens, p_screens if has_prev else None, has_prev, "개"),
            },
        }

        # 경쟁작 경쟁 포지션 — 4개 지표별 1위 작품 (서로 다를 수 있음, §B-6)
        # C001(0831): 점유율 1위는 '조회 기간 총 좌석수 TOP 10' 작품 중에서만 뽑는다.
        # 좌석 모수가 극소수인 소규모 상영작이 비율만으로 1위 카드에 오르는 튐 방지.
        # 점유율 값 자체는 기간 전체 합계(SUM 예매 ÷ SUM 좌석) 기준 그대로다.
        # C001(0901): 추가로 '기간 총 좌석수 10만석 이상' 모수 필터를 적용한다(방안 B).
        # TOP 10 안에서도 좌석 모수가 10만석 미만인 작품은 점유율 1위 후보에서 제외하되,
        # 조회 기간이 짧아 10만석 이상 작품이 하나도 없으면 TOP 10 전체로 폴백한다
        # (1위 카드가 비는 것 방지).
        OCC_MIN_SEATS = 100_000

        def _occ_rank_in_top10(movie_aggs, key):
            """총 좌석수 TOP 10(+10만석 필터) 안에서의 점유율 순위 (동률 1,2,2,4). 밖이면 None."""
            top = sorted(movie_aggs.items(), key=lambda kv: -kv[1].total)[:10]
            pool = [kv for kv in top if kv[1].total >= OCC_MIN_SEATS] or top
            prev_val, prev_rank = None, 0
            for i, (k, a) in enumerate(sorted(pool, key=lambda kv: -kv[1].occupancy), 1):
                rank = prev_rank if a.occupancy == prev_val else i
                prev_val, prev_rank = a.occupancy, rank
                if k == key:
                    return rank
            return None

        metric_fns = {
            "seats": (lambda s: s["total_seats"], "석"),
            "reserved": (lambda s: s["reserved"], "석"),
            "occupancy": (lambda s: s["occupancy"], "%"),
            "shows": (lambda s: s["shows"], "회"),
        }
        # movies는 총 좌석수 내림차순 정렬 상태 — TOP 10 중 10만석 이상만 (없으면 TOP 10 폴백)
        occ_top10 = movies[:10]
        occ_pool = [s for s in occ_top10 if s["total_seats"] >= OCC_MIN_SEATS] or occ_top10
        leaders = {}
        for m, (fn, unit) in metric_fns.items():
            top = max(occ_pool if m == "occupancy" else movies, key=fn)
            if m == "occupancy":
                prev_rank = _occ_rank_in_top10(prev_by_movie, top["key"]) if has_prev else None
                cur_rank = _occ_rank_in_top10(by_movie, top["key"])
            else:
                prev_rank = prev_ranks.get(top["key"], {}).get(m) if has_prev else None
                cur_rank = ranks[top["key"]][m]
            leaders[m] = {
                "title": top["title"],
                "value": fn(top),
                "unit": unit,
                "prev_rank": prev_rank,
                "cur_rank": cur_rank,
            }
        data["leaders"] = leaders

    # ================= M001: P.4 일별 비교 데이터 =================
    cur_day = cur["by_movie_day"]
    prev_day_map = prev["by_movie_day"]
    prev_days_with_data = {dd for (_, dd) in prev_day_map.keys()}

    def _daily_kpi_rows(only_key=None):
        """일자별 4대 지표(총좌석/예매/점유율/회차) + 전주 같은 요일 대비.

        only_key가 있으면 그 작품만(주요작 모드 ①), 없으면 조사작품 전체 합
        (주요작 없음 모드 ① '전체 시장').
        """
        rows = []
        for d, pd_ in zip(cur_dates, prev_dates):
            t = s = sh = 0
            pt = ps = psh = 0
            p_has_movie = False
            for (k, dd), a in cur_day.items():
                if dd == d and (only_key is None or k == only_key):
                    t += a.total; s += a.sold; sh += a.shows
            for (k, dd), a in prev_day_map.items():
                if dd == pd_ and (only_key is None or k == only_key):
                    pt += a.total; ps += a.sold; psh += a.shows
                    p_has_movie = True
            has_prev_day = pd_ in prev_days_with_data
            occ = (s / t * 100) if t else 0.0
            p_occ = (ps / pt * 100) if pt else 0.0
            rows.append({
                "date": d, "prev_date": pd_,
                "total_seats": t, "reserved": s, "occupancy": occ, "shows": sh,
                "seats_cmp": _cmp(t, pt if p_has_movie else None, has_prev_day, "석"),
                "reserved_cmp": _cmp(s, ps if p_has_movie else None, has_prev_day, "석"),
                "occ_cmp": _occ_cmp(occ, p_occ if p_has_movie else None, has_prev_day),
                "shows_cmp": _cmp(sh, psh if p_has_movie else None, has_prev_day, "회"),
            })
        return rows

    # ② 총 좌석수(기간 합) 기준 TOP10 — 주요작이 TOP10 밖이면 별도 행으로 추가
    top_entries = list(movies[:10])
    if main_key and not any(s["is_main"] for s in top_entries):
        main_entry = next((s for s in movies if s["is_main"]), None)
        if main_entry:
            top_entries.append(main_entry)
    rank_of = {s["key"]: i for i, s in enumerate(movies, 1)}
    daily_top = []
    for s in top_entries:
        key = s["key"]
        days = []
        for d, pd_ in zip(cur_dates, prev_dates):
            a = cur_day.get((key, d))
            pa = prev_day_map.get((key, pd_))
            seats = a.total if a else 0
            occ = a.occupancy if a else 0.0
            days.append({
                "total_seats": seats,
                "occupancy": occ,
                "seats_cmp": _cmp(seats, pa.total if pa else None,
                                  pd_ in prev_days_with_data, "석"),
            })
        daily_top.append({"rank": rank_of[key], "title": s["title"],
                          "is_main": s["is_main"], "days": days})

    # A001(0829): 일자별 전체 작품 상세 — 주요작 없음 보고서의 P.2 이후 페이지
    # (각 일자를 한 장씩, 그 날의 총 좌석수 내림차순으로 전 작품을 싣는다)
    by_date_movies = []
    for d, pd_ in zip(cur_dates, prev_dates):
        day_rows = [(k, a) for (k, dd), a in cur_day.items() if dd == d]
        day_rows.sort(key=lambda kv: -kv[1].total)
        day_grand = sum(a.total for _, a in day_rows)
        rows = []
        for i, (key, a) in enumerate(day_rows, 1):
            pa = prev_day_map.get((key, pd_))
            rows.append({
                "rank": i,
                "key": key,
                "title": title_of[key],
                "is_main": key == main_key,
                "total_seats": a.total,
                "seats_cmp": _cmp(a.total, pa.total if pa else None,
                                  pd_ in prev_days_with_data, "석"),
                "share": (a.total / day_grand * 100) if day_grand else 0.0,
                "reserved": a.sold,
                "occupancy": a.occupancy,
                "theaters": a.theater_count,
                "screens": a.screen_count,
                "shows": a.shows,
            })
        by_date_movies.append({"date": d, "prev_date": pd_, "rows": rows})

    data["daily"] = {
        "dates": cur_dates,
        "prev_dates": prev_dates,
        "kpi_rows": _daily_kpi_rows(only_key=main_key),  # main 없으면 전체 시장
        "top": daily_top,
        "by_date_movies": by_date_movies,
    }

    if main_key:
        # ③ 주요작 일자별 주요 시간대 회차 배정 비중
        slot_counts = cur["day_slot_shows"]
        slot_rows, total_by_slot, grand_shows = [], [0] * len(DAY_SLOTS), 0
        for d in cur_dates:
            counts = slot_counts.get((main_key, d), {})
            tot = sum(counts.values())
            row_counts = [counts.get(i, 0) for i in range(len(DAY_SLOTS))]
            slot_rows.append({"date": d, "counts": row_counts, "total": tot})
            for i, c in enumerate(row_counts):
                total_by_slot[i] += c
            grand_shows += tot
        data["daily"]["slots"] = {
            "labels": [lbl for lbl, _, _ in DAY_SLOTS],
            "rows": slot_rows,
            "avg_pct": [(c / grand_shows * 100) if grand_shows else 0.0
                        for c in total_by_slot],
        }

    # ---- 데이터 검증 (§20) — 실패 시 예외가 아니라 경고 목록으로 전달 ----
    warnings = []
    for s in movies:
        if s["reserved"] > s["total_seats"]:
            warnings.append(f"{s['title']}: 예매좌석수가 총 좌석수보다 큽니다.")
    share_sum = sum(s["share"] for s in movies)
    if movies and abs(share_sum - 100.0) > 0.5:
        warnings.append(f"점유비중 합계가 100%가 아닙니다 ({share_sum:.1f}%).")
    if main_key:
        multi_sum = sum(m["total_seats"] for m in data["main_multis"])
        if multi_sum != data["main"]["total_seats"]:
            warnings.append("멀티별 총 좌석수 합이 주요작 전체와 다릅니다.")
    data["warnings"] = warnings

    return data
