"""
C002(1104): 씨네큐 사이트(www.cineq.co.kr) 상영시간표 크롤러.

씨네큐는 예전엔 영진위(KOBIS) 시간표로만 수집했지만, KOBIS에는 좌석수·특수상영
표기가 없다. CGV/롯데/메가박스처럼 자사 사이트에서 직접 받아 '프리미어'·'무대인사'
같은 아이콘 표기와 좌석수(잔여/전체)를 함께 저장한다.

- 극장 목록: 극장 페이지 상단 메뉴(/Theater?TheaterCode=...)에서 매번 읽는다(신규·폐관 자동 반영).
- 시간표: POST /Theater/MovieTable2 {TheaterCode, PlayDate=YYYYMMDD} → HTML 조각.
- 저장: 구조화한 JSON 을 KobisScheduleLog(site_code='CINEQ_<극장코드>')에 넣는다.
  씨네큐는 brand '일반극장'으로 표기하기로 했으므로(1104 결정) 일반극장(KOBIS) 크롤
  파이프라인 안에서 같이 돌고, 같은 (일반극장×상영일) 교체 범위에 묶인다.
  변환은 MovieSchedule.create_from_kobis_log 가 site_code 접두어로 판별해
  create_from_cineq_log 로 넘긴다.
- 사이트 크롤이 실패한 극장·날짜는 로그를 남기지 않는다 → 데이터 없이 비워 둔다
  (KOBIS 데이터로 대체하지 않음 — 1104 결정).
"""
import html as _html
import re
import time

import requests
from django.db import close_old_connections

BASE = "https://www.cineq.co.kr"
SITE_CODE_PREFIX = "CINEQ_"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": BASE + "/Theater",
    "X-Requested-With": "XMLHttpRequest",
}
REQUEST_INTERVAL = 0.3  # 요청 간격(초) — 서버 부하 방지

# 시간표 아이콘 중 이벤트가 아닌 판촉 표기 — 3사 크롤과 같이 할인·패키지 프로모션은 태그에서 뺀다.
# (이벤트 아이콘: 프리미어·무대인사·기획전 등은 그대로 태그로 저장)
# (사이트 범례 1104 기준: 조조·굿즈증정·특가할인·F&B포함 = 판촉 / 3D·더빙은 포맷·자막 구분으로 그대로 저장)
PROMO_ATTRIBS = {"조조", "굿즈증정", "특가할인", "F&B포함"}


def is_cineq_log(site_code):
    return str(site_code or "").startswith(SITE_CODE_PREFIX)


def is_cineq_kobis_name(name):
    """KOBIS 극장명이 씨네큐 극장인지 — KOBIS 수집에서 제외할 때 쓴다.
    예) '씨네큐 신도림', '씨네Q 보은', '칠곡호이영화관(씨네Q)'. '씨네큐브'(별개 극장)는 아님."""
    norm = re.sub(r"\s+", "", str(name or "")).lower()
    if "씨네큐브" in norm:
        return False
    return "씨네큐" in norm or "씨네q" in norm


def fetch_theater_list(session=None):
    """씨네큐 극장 목록 [(극장코드, 극장명)] — 극장 페이지 메뉴에서 읽는다.
    지역 탭(onmouseover 있는 링크)·'영화관' 메뉴 링크는 제외한다."""
    s = session or requests.Session()
    r = s.get(BASE + "/Theater?TheaterCode=1001", headers=HEADERS, timeout=20)
    r.raise_for_status()
    out, seen = [], set()
    for m in re.finditer(r'<a href="/Theater\?TheaterCode=(\d+)"([^>]*)>([^<]+)</a>', r.text):
        code, attrs, name = m.group(1), m.group(2), _html.unescape(m.group(3)).strip()
        if "onmouseover" in attrs or name in ("영화관", "") or code in seen:
            continue
        seen.add(code)
        out.append((code, name))
    return out


def parse_movie_table(html_text):
    """MovieTable2 HTML → [{title, screens:[{screen, times:[{start,end,remain,total,attribs,plan_id}]}]}]"""
    movies = []
    # 영화 단위 블록
    for block in re.split(r'<div class="each-movie-time">', html_text)[1:]:
        tm = re.search(r'<div class="title">(.*?)</div>', block, re.S)
        if not tm:
            continue
        # 관람등급 배지(<span class="rate-15">15</span>) 제거
        title = re.sub(r"<span[^>]*>.*?</span>", "", tm.group(1), flags=re.S)
        title = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", "", title))).strip()
        screens = []
        for sblock in re.split(r'<div class="screen">', block)[1:]:
            sm = re.search(r'<div class="screen-name"[^>]*>(.*?)</div>', sblock, re.S)
            screen = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", sm.group(1)))).strip() if sm else ""
            times = []
            for tblock in re.split(r'<div class="time"', sblock)[1:]:
                st = re.search(r"(\d{1,2}:\d{2})\s*<span class=\"to\">\s*~\s*(\d{1,2}:\d{2})", tblock)
                if not st:
                    continue
                seats = re.search(r'seats-status">\s*(\d+)\s*/\s*(\d+)', tblock)
                plan = re.search(r'data-screenplanid="(\d+)"', tblock)
                attribs = [_html.unescape(a).strip() for a in
                           re.findall(r'class="timetable-attrib-[^"]*"\s+title="([^"]*)"', tblock)]
                times.append({
                    "start": st.group(1),
                    "end": st.group(2),
                    "remain": int(seats.group(1)) if seats else None,
                    "total": int(seats.group(2)) if seats else None,
                    "attribs": [a for a in attribs if a],
                    "plan_id": plan.group(1) if plan else None,
                })
            if times:
                screens.append({"screen": screen, "times": times})
        if screens:
            movies.append({"title": title, "screens": screens})
    return movies


def collect_schedule_logs(dates, stop_signal=None, crawler_run=None):
    """씨네큐 전 극장 × 날짜 시간표 수집 → KobisScheduleLog(site_code='CINEQ_<코드>') 저장.
    Returns (collected[{log_id,date}], theater_count, failures[])."""
    from crawler.models import KobisScheduleLog

    collected, failures = [], []
    session = requests.Session()
    try:
        theaters = fetch_theater_list(session)
    except Exception as e:
        failures.append({"region": "씨네큐", "theater": "극장 목록", "date": "",
                         "reason": str(e)[:60], "worker": "cineq"})
        print(f"[씨네큐] 극장 목록 조회 실패: {e}")
        return collected, 0, failures

    for code, name in theaters:
        for ymd in dates:
            if stop_signal:
                stop_signal()
            try:
                r = session.post(BASE + "/Theater/MovieTable2",
                                 data={"TheaterCode": code, "PlayDate": ymd},
                                 headers=HEADERS, timeout=20)
                r.raise_for_status()
                movies = parse_movie_table(r.text)
                close_old_connections()
                log, _ = KobisScheduleLog.objects.update_or_create(
                    query_date=ymd,
                    site_code=f"{SITE_CODE_PREFIX}{code}",
                    defaults={
                        "theater_name": f"씨네큐 {name}",
                        "response_json": {
                            "source": "cineq", "theater_code": code, "theater_name": name,
                            "play_date": ymd, "movies": movies,
                        },
                        "status": "success",
                        "crawler_run": crawler_run,
                    },
                )
                collected.append({"log_id": log.id, "date": ymd})
            except Exception as e:
                failures.append({"region": "씨네큐", "theater": f"씨네큐 {name}", "date": ymd,
                                 "reason": str(e)[:60], "worker": "cineq"})
            time.sleep(REQUEST_INTERVAL)

    print(f"[씨네큐] 수집 완료 - {len(theaters)}곳 / 로그 {len(collected)}건 / 실패 {len(failures)}건")
    return collected, len(theaters), failures


def cineq_theater_names():
    """MovieSchedule 에 씨네큐 극장으로 저장되는 극장명 집합 (brand='일반극장').

    변환기(create_from_cineq_log)는 거래처(멀티='씨네큐')의 거래처명으로 저장하고,
    못 찾으면 '씨네큐'+사이트 극장명을 쓴다. 교체(삭제) 범위를 정확히 나누기 위해
    거래처명과, 이미 저장된 씨네큐 표기('씨네큐브'는 별개 극장이라 제외)를 함께 쓴다.
    """
    from client.models import Client
    from crawler.models import MovieSchedule
    names = {n for n in Client.objects.filter(theater_kind="씨네큐")
             .values_list("client_name", flat=True) if n}
    names |= {n for n in MovieSchedule.objects.filter(
        brand="일반극장", theater_name__startswith="씨네큐")
        .values_list("theater_name", flat=True).distinct()
        if not n.startswith("씨네큐브")}
    return names


class CineQPipelineService:
    """C002(1104): 크롤러 관리의 독립 크롤 대상 '씨네큐' (CGV/롯데/메가박스와 같은 단위).

    수집 로그는 KobisScheduleLog(site_code='CINEQ_…')에 저장하고, 변환 결과는
    brand='일반극장'(엑셀·보고서 표기 유지)으로 저장한다. 교체 범위는
    MovieSchedule.replace_before_transform(..., scope='cineq') 로 씨네큐 극장만.
    """

    @classmethod
    def collect_schedule_logs(cls, dates=None, stop_signal=None, crawler_run=None, **_):
        from datetime import datetime
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]
        return collect_schedule_logs(dates, stop_signal=stop_signal, crawler_run=crawler_run)

    @staticmethod
    def transform_logs_to_schedule(log_ids=None, target_titles=None):
        from crawler.models import CrawlTitleAlias, KobisScheduleLog, MovieSchedule
        logs = KobisScheduleLog.objects.filter(id__in=log_ids or [], site_code__startswith=SITE_CODE_PREFIX)
        title_map = CrawlTitleAlias.build_map()
        total, errors = 0, []
        for log in logs:
            try:
                cnt, errs = MovieSchedule.create_from_cineq_log(log, target_titles=target_titles, title_map=title_map)
                total += cnt
                errors.extend(errs)
            except Exception as e:
                errors.append({"theater": log.theater_name, "error": str(e), "log_id": log.id})
        return total, errors

    @classmethod
    def send_slack_message(cls, message_type, data):
        # 다른 파이프라인과 시그니처 호환용 (별도 Slack 설정 없음 — 콘솔 출력)
        print(f"[씨네큐 Slack:{message_type}] "
              f"{ {k: data.get(k) for k in ('collected', 'total_master')} if message_type == 'SUCCESS' else data}")
