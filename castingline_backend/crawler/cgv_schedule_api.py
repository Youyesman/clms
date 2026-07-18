"""CGV 시간표 수집 — 순수 HTTP API (requests) 방식.

기존 run_cgv_pipeline.py 는 headless Chromium(Playwright)으로 예매 페이지를
띄워 지역→극장→날짜를 클릭하고 XHR(searchMovScnInfo)을 가로챘다. CGV 신규
사이트(cgv.co.kr/cnm)는 REST JSON API로 동작하며 Cloudflare 봇 관리를 통과하는
일반 요청이면 requests 로 직접·병렬 수집할 수 있다.

  1) GET /api/v1/content/site/searchAllRegionAndSite?coCd=A420
     → data.siteInfo: 전국 극장 목록(siteNo, siteNm). 매 실행 최신 조회라 극장
       신설/폐관/개명이 자동 반영된다(캐싱 없음).
  2) GET /api/v1/booking/searchMovScnInfo?coCd=A420&siteNo=..&scnYmd=..&rtctlScopCd=08
     → data: 극장×날짜 상영 회차 리스트. 응답 JSON을 그대로
       CGVScheduleLog.response_json 에 저장 → 기존 파서
       (MovieSchedule.create_from_cgv_log) 가 변경 없이 처리한다.
       (브라우저가 가로채던 응답과 필드가 100% 동일함을 확인)
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests
from django.db import close_old_connections

from crawler.models import CGVScheduleLog

BASE = "https://cgv.co.kr"
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
_CO_CD = "A420"
_RTCTL = "08"  # 발매통제범위코드 (예매 채널)
_SITE_URL = f"{BASE}/api/v1/content/site/searchAllRegionAndSite"
_SCHED_URL = f"{BASE}/api/v1/booking/searchMovScnInfo"

_MAX_WORKERS = 8
_RETRY = 3


def _new_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": _UA,
        "Accept": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": f"{BASE}/cnm/movieBook/cinema",
    })
    # Cloudflare 쿠키(__cf_bm 등) 확보
    for attempt in range(_RETRY):
        try:
            s.get(f"{BASE}/cnm/movieBook/cinema", timeout=20)
            break
        except requests.RequestException:
            time.sleep(0.5 * (attempt + 1))
    return s


def fetch_theater_list(session):
    """전국 극장 목록 조회 → [{siteNo, siteNm}] (매 실행 최신)."""
    last_err = None
    for attempt in range(_RETRY):
        try:
            r = session.get(_SITE_URL, params={"coCd": _CO_CD}, timeout=30)
            r.raise_for_status()
            data = r.json().get("data", {})
            out = []
            for it in data.get("siteInfo", []):
                site_no = it.get("siteNo")
                if site_no:
                    out.append({"siteNo": site_no, "siteNm": it.get("siteNm") or ""})
            return out
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))
    raise last_err


def fetch_schedule_json(session, site_no, scn_ymd):
    """극장×날짜 상영 회차 조회 (searchMovScnInfo 응답 원본)."""
    params = {"coCd": _CO_CD, "siteNo": site_no,
              "scnYmd": scn_ymd, "rtctlScopCd": _RTCTL}
    last_err = None
    for attempt in range(_RETRY):
        try:
            r = session.get(_SCHED_URL, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise last_err


def _save_log(theater, scn_ymd, json_data, crawler_run):
    close_old_connections()
    site_no = theater["siteNo"]
    dup_qs = CGVScheduleLog.objects.filter(query_date=scn_ymd, site_code=site_no)
    if dup_qs.count() > 1:
        keep_id = dup_qs.order_by('-created_at').values_list('id', flat=True).first()
        dup_qs.exclude(id=keep_id).delete()
    log, _created = CGVScheduleLog.objects.update_or_create(
        query_date=scn_ymd, site_code=site_no,
        defaults={
            "theater_name": theater["siteNm"],
            "response_json": json_data,
            "status": "success",
            "crawler_run": crawler_run,
        },
    )
    return log.id


def collect_schedule_logs(dates=None, stop_signal=None, crawler_run=None):
    """CGV 시간표 수집(API). 기존 서비스와 동일한 반환 형식.

    반환: (collected_logs[{log_id, date}], total_theater_count, failures[{...}])
    """
    if not dates:
        dates = [datetime.now().strftime("%Y%m%d")]

    session = _new_session()
    theaters = fetch_theater_list(session)
    total_theater_count = len(theaters)
    print(f"[CGV-API] 극장 목록 {total_theater_count}개 확보")

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
        try:
            json_data = fetch_schedule_json(s, theater["siteNo"], scn_ymd)
            # CGV 성공 코드는 statusCode 0(스케줄) — data 키 존재로 판정
            if not json_data or "data" not in json_data:
                raise RuntimeError(f"no data (statusCode={json_data.get('statusCode') if json_data else None})")
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

    print(f"[CGV-API] 수집 완료: {len(collected_logs)}/{len(tasks)} "
          f"(실패 {len(failures)})")
    return collected_logs, total_theater_count, failures
