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
"""
from collections import defaultdict
from datetime import timedelta

from crawler.models import MovieSchedule, CrawlTargetMovie

# 보고서가 구분하는 멀티(체인). 그 외(일반극장 등)는 '기타'로 묶는다. (§7)
MULTI_LABEL = {"CGV": "CGV", "LOTTE": "롯데", "MEGABOX": "메가박스"}
MULTI_ORDER = ["CGV", "롯데", "메가박스", "기타"]


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


def _movie_units(main_title=None):
    """크롤 대상 영화 → 보고서 작품 단위 목록.

    같은 작품이 주요작/경쟁작으로 중복 등록돼 있어도(§5) 정규화 제목 기준으로
    한 번만 집계한다. 주요작(main_title)이 지정되면 목록 맨 앞에 둔다.
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

    if main_title:
        push(main_title)
    for t in CrawlTargetMovie.objects.filter(is_active=True).order_by("id"):
        push(t.title)

    main_key = None
    if main_title:
        clean, _ = MovieSchedule.parse_and_normalize_title(main_title)
        main_key = MovieSchedule.normalize_title(clean)
    return units, main_key


def _collect(start_date, end_date, units, brands=None, maps=None):
    """기간 내 MovieSchedule 을 작품 단위로 배정해 집계한다.

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

    qs = MovieSchedule.objects.filter(play_date__gte=start_date, play_date__lte=end_date)
    if brands:
        qs = qs.filter(brand__in=brands)

    by_movie = defaultdict(_Agg)
    by_multi = defaultdict(_Agg)
    by_theater = defaultdict(_Agg)
    grand_theaters = set()
    grand_day_screens = set()

    # 같은 제목 문자열은 매번 다시 매칭하지 않도록 캐시 (§5: 한 행은 한 작품에만 배정)
    title_cache = {}

    def match_unit(raw_title):
        if raw_title in title_cache:
            return title_cache[raw_title]
        matched = None
        for u in units:
            if MovieSchedule.title_matches(u["title"], raw_title):
                matched = u["key"]
                break
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
            key = match_unit(sch.movie_title)
            if key is None:
                continue  # 크롤 대상 외(타 영화 특수상영 등)는 보고서 제외
            buckets[key].append(sch)

        for key, schedules in buckets.items():
            rows, _ = _process_to_rows(schedules, region_map, normal_index)
            for r in rows:
                by_movie[key].add(r, play_date)
                by_multi[(key, _brand_to_multi(r["brand"]))].add(r, play_date)
                by_theater[(key, (r["brand"], r["theater"]))].add(r, play_date)
                grand_theaters.add((r["brand"], r["theater"]))
                grand_day_screens.add((play_date, r["brand"], r["theater"], r["screen"]))

    return {
        "by_movie": by_movie,
        "by_multi": by_multi,
        "by_theater": by_theater,
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


def build_report_data(start_date, end_date, main_title=None, brands=None):
    """보고서 ViewModel 생성. main_title이 없으면 '주요작 없음' 모드.

    brands: 엑셀 다운로드와 같은 계열사 필터(["CGV","LOTTE","MEGABOX","일반극장"]).
            None이면 전체.
    """
    from crawler.utils.excel_exporter import _build_region_map, _build_normal_theater_index

    prev_start = start_date - timedelta(days=7)
    prev_end = end_date - timedelta(days=7)

    units, main_key = _movie_units(main_title)
    if not units:
        raise ValueError("크롤 대상 영화가 없습니다. [크롤러 관리]에서 먼저 등록하세요.")

    # 지역/일반극장 인덱스는 비싸므로 기준기간·전주에서 한 번만 만들어 공유한다
    maps = (_build_region_map(), _build_normal_theater_index())

    cur = _collect(start_date, end_date, units, brands=brands, maps=maps)
    prev = _collect(prev_start, prev_end, units, brands=brands, maps=maps)

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
                   "prev_start": prev_start, "prev_end": prev_end},
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
        metric_fns = {
            "seats": (lambda s: s["total_seats"], "석"),
            "reserved": (lambda s: s["reserved"], "석"),
            "occupancy": (lambda s: s["occupancy"], "%"),
            "shows": (lambda s: s["shows"], "회"),
        }
        leaders = {}
        for m, (fn, unit) in metric_fns.items():
            top = max(movies, key=fn)
            leaders[m] = {
                "title": top["title"],
                "value": fn(top),
                "unit": unit,
                "prev_rank": prev_ranks.get(top["key"], {}).get(m) if has_prev else None,
                "cur_rank": ranks[top["key"]][m],
            }
        data["leaders"] = leaders

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
