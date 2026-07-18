"""롯데시네마 시간표 수집 — 순수 HTTP API (requests) 방식.

기존 run_lotte_pipeline.py 는 headless Chromium(Playwright)으로 예매 페이지를
띄워 지역→극장→날짜를 클릭하고 XHR(TicketingData)을 가로챘다. 롯데시네마는
LCWS 공개 JSON API(paramList POST)로 동작하므로 requests 로 직접·병렬 수집한다.

  1) POST /LCWS/Cinema/CinemaData.aspx  {MethodName:GetCinemaItems}
     → Cinemas.Items: 전국 극장 목록. DivisionCode==1(일반 예매 극장)만 사용.
       매 실행 최신 조회라 극장 신설/폐관/개명이 자동 반영된다(캐싱 없음).
  2) POST /LCWS/Ticketing/TicketingData.aspx  {MethodName:GetPlaySequence,
     cinemaID:"1|1|{CinemaID}", playDate:"YYYY-MM-DD"}
     → PlaySeqs.Items: 극장×날짜 상영 회차. 응답 JSON을 그대로
       LotteScheduleLog.response_json 에 저장 → 기존 파서
       (MovieSchedule.create_from_lotte_log) 가 변경 없이 처리한다.
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests
from django.db import close_old_connections

from crawler.models import LotteScheduleLog

BASE = "https://www.lottecinema.co.kr"
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
_CINEMA_URL = f"{BASE}/LCWS/Cinema/CinemaData.aspx"
_TICKET_URL = f"{BASE}/LCWS/Ticketing/TicketingData.aspx"

_MAX_WORKERS = 8
_RETRY = 3
# 일반 예매 극장 구분코드. 특별관(2)은 같은 극장의 중복이라 제외.
_DIVISION_GENERAL = 1


def _new_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": _UA,
        "Referer": f"{BASE}/NLCHS/Ticketing/Schedule",
    })
    for attempt in range(_RETRY):
        try:
            s.get(f"{BASE}/NLCHS/Ticketing/Schedule", timeout=20)
            break
        except requests.RequestException:
            time.sleep(0.5 * (attempt + 1))
    return s


def _post_lcws(session, url, method_params):
    base = {"channelType": "HO", "osType": "W", "osVersion": "Chrome",
            "multiLanguageID": "KR"}
    base.update(method_params)
    r = session.post(url, data={"paramList": json.dumps(base)}, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_theater_list(session):
    """전국 일반 예매 극장 목록 → [{cinemaID, siteNm}] (매 실행 최신)."""
    last_err = None
    for attempt in range(_RETRY):
        try:
            j = _post_lcws(session, _CINEMA_URL, {"MethodName": "GetCinemaItems"})
            out = []
            for it in j.get("Cinemas", {}).get("Items", []):
                if it.get("DivisionCode") != _DIVISION_GENERAL:
                    continue
                cid = it.get("CinemaID")
                if cid is None:
                    continue
                out.append({"cinemaID": str(cid),
                            "siteNm": it.get("CinemaNameKR") or ""})
            return out
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))
    raise last_err


def fetch_schedule_json(session, cinema_id, play_date_hyphen):
    """극장×날짜 상영 회차 조회 (GetPlaySequence 응답 원본)."""
    params = {
        "MethodName": "GetPlaySequence",
        "playDate": play_date_hyphen,        # YYYY-MM-DD
        "cinemaID": f"1|1|{cinema_id}",       # 구분|정렬|극장ID (일반 예매)
        "representationMovieCode": "",
    }
    last_err = None
    for attempt in range(_RETRY):
        try:
            return _post_lcws(session, _TICKET_URL, params)
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise last_err


def _save_log(theater, scn_ymd, json_data, crawler_run):
    close_old_connections()
    theater_name = theater["siteNm"]
    # 롯데 unique key = (query_date, theater_name)
    dup_qs = LotteScheduleLog.objects.filter(query_date=scn_ymd,
                                             theater_name=theater_name)
    if dup_qs.count() > 1:
        keep_id = dup_qs.order_by('-created_at').values_list('id', flat=True).first()
        dup_qs.exclude(id=keep_id).delete()
    log, _created = LotteScheduleLog.objects.update_or_create(
        query_date=scn_ymd, theater_name=theater_name,
        defaults={
            "site_code": theater["cinemaID"],
            "response_json": json_data,
            "status": "success",
            "crawler_run": crawler_run,
        },
    )
    return log.id


def collect_schedule_logs(dates=None, stop_signal=None, crawler_run=None):
    """롯데 시간표 수집(API). 기존 서비스와 동일한 반환 형식.

    반환: (collected_logs[{log_id, date}], total_theater_count, failures[{...}])
    """
    if not dates:
        dates = [datetime.now().strftime("%Y%m%d")]

    session = _new_session()
    theaters = fetch_theater_list(session)
    total_theater_count = len(theaters)
    print(f"[Lotte-API] 극장 목록 {total_theater_count}개 확보")

    tasks = [(t, d) for d in dates for t in theaters]
    collected_logs = []
    failures = []

    import threading
    _local = threading.local()

    def _init():
        _local.session = _new_session()

    def _run(task):
        theater, scn_ymd = task
        if stop_signal:
            stop_signal()
        s = getattr(_local, "session", None) or _new_session()
        _local.session = s
        play_date = f"{scn_ymd[:4]}-{scn_ymd[4:6]}-{scn_ymd[6:]}"
        try:
            json_data = fetch_schedule_json(s, theater["cinemaID"], play_date)
            if not json_data or json_data.get("IsOK") != "true":
                raise RuntimeError(f"IsOK={json_data.get('IsOK') if json_data else None}")
            log_id = _save_log(theater, scn_ymd, json_data, crawler_run)
            return ("ok", {"log_id": log_id, "date": scn_ymd})
        except Exception as e:
            return ("fail", {
                "region": "", "theater": theater["siteNm"],
                "date": scn_ymd, "reason": f"API Error: {str(e)[:60]}",
                "worker": "API",
            })

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS, initializer=_init) as ex:
        futures = [ex.submit(_run, t) for t in tasks]
        for fut in as_completed(futures):
            kind, payload = fut.result()
            (collected_logs if kind == "ok" else failures).append(payload)

    print(f"[Lotte-API] 수집 완료: {len(collected_logs)}/{len(tasks)} "
          f"(실패 {len(failures)})")
    return collected_logs, total_theater_count, failures
