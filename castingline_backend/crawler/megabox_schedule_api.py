"""메가박스 시간표 수집 — 순수 HTTP API (requests) 방식.

기존 run_megabox_pipeline.py 는 headless Chromium(Playwright)으로 예매 페이지를
띄워 지역→극장→날짜를 실제 클릭하고 XHR을 가로챘다. 그러나 메가박스는 내부적으로
JSON API로 동작하므로, 브라우저 없이 requests 로 동일 데이터를 직접·병렬 수집한다.

  1) POST /on/oh/ohb/PlayTime/selectPlayTimeMasterList.do  {playDe}
     → areaBrchList: 전국 극장 목록(brchNo, brchNm, areaCdNm). 매 실행 최신 조회라
       극장 신설/폐관/개명이 자동 반영된다(캐싱 없음).
  2) POST /on/oh/ohc/Brch/schedulePage.do  {brchNo, playDe, crtDe, ...}
     → megaMap.movieFormList: 극장×날짜 상영 스케줄. 응답 JSON을 그대로
       MegaboxScheduleLog.response_json 에 저장 → 기존 파서
       (MovieSchedule.create_from_megabox_log) 가 변경 없이 처리한다.

극장×날짜를 ThreadPoolExecutor 로 병렬 요청한다. 브라우저 기동/렌더/클릭/고정
sleep 이 전부 사라져 벽시계 시간이 크게 단축된다.
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests
from django.db import close_old_connections

from crawler.models import MegaboxScheduleLog

BASE = "https://www.megabox.co.kr"
_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
_MASTER_URL = f"{BASE}/on/oh/ohb/PlayTime/selectPlayTimeMasterList.do"
_SCHEDULE_URL = f"{BASE}/on/oh/ohc/Brch/schedulePage.do"

# 극장×날짜 동시 요청 수. 메가박스는 keep-alive 연결에 짧은 시간 다량 요청이
# 몰리면 연결을 리셋(ConnectionReset 10054)하므로 보수적으로 둔다.
_MAX_WORKERS = 4
_RETRY = 4  # 일시적 연결 리셋/타임아웃 재시도 횟수
_REQ_GAP = 0.12  # 요청 간 최소 간격(초) — rate-limit 회피


def _new_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": _UA,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"{BASE}/booking/timetable",
        # keep-alive 연결 재사용 시 서버가 리셋하는 경향 → 매 요청 새 연결
        "Connection": "close",
    })
    # 세션/쿠키 확보 (일부 방화벽이 Referer+쿠키 없는 API 직호출을 차단)
    for attempt in range(_RETRY):
        try:
            s.get(f"{BASE}/booking/timetable", timeout=20)
            break
        except requests.RequestException:
            time.sleep(0.5 * (attempt + 1))
    return s


def fetch_theater_list(session, play_de):
    """전국 극장 목록 조회 → [{brchNo, brchNm, areaNm}] (매 실행 최신)."""
    last_err = None
    data = None
    for attempt in range(_RETRY):
        try:
            r = session.post(_MASTER_URL, data=json.dumps({"playDe": play_de}),
                             timeout=30)
            r.raise_for_status()
            data = r.json()
            break
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))
    if data is None:
        raise last_err
    theaters = []
    for b in data.get("areaBrchList", []):
        brch_no = b.get("brchNo")
        if not brch_no:
            continue
        theaters.append({
            "brchNo": brch_no,
            "brchNm": b.get("brchNm") or "",
            "areaNm": b.get("areaCdNm") or "",
        })
    return theaters


def fetch_schedule_json(session, brch_no, play_de, crt_de):
    """극장×날짜 스케줄 JSON 조회 (schedulePage.do 응답 원본).

    일시적 연결 리셋/타임아웃은 지수 백오프로 재시도한다.
    """
    payload = json.dumps({
        "masterType": "brch", "detailType": "area",
        "brchNo": brch_no, "firstAt": "N", "brchNo1": brch_no,
        "crtDe": crt_de, "playDe": play_de,
    })
    last_err = None
    for attempt in range(_RETRY):
        try:
            r = session.post(_SCHEDULE_URL, data=payload, timeout=30)
            r.raise_for_status()
            return r.json()
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))  # 0.5s, 1.0s, 1.5s
    raise last_err


def _save_log(theater, play_de, json_data, crawler_run):
    """기존 브라우저 방식과 동일하게 MegaboxScheduleLog 업서트."""
    close_old_connections()
    brch_no = theater["brchNo"]
    # 과거 중복 로그 정리 (기존 로직과 동일)
    dup_qs = MegaboxScheduleLog.objects.filter(query_date=play_de, site_code=brch_no)
    if dup_qs.count() > 1:
        keep_id = dup_qs.order_by('-created_at').values_list('id', flat=True).first()
        dup_qs.exclude(id=keep_id).delete()
    log, _created = MegaboxScheduleLog.objects.update_or_create(
        query_date=play_de, site_code=brch_no,
        defaults={
            "theater_name": theater["brchNm"],
            "response_json": json_data,
            "status": "success",
            "crawler_run": crawler_run,
        },
    )
    return log.id


def collect_schedule_logs(dates=None, stop_signal=None, crawler_run=None):
    """메가박스 시간표 수집(API). 기존 서비스와 동일한 반환 형식.

    반환: (collected_logs[{log_id, date}], total_theater_count, failures[{...}])
    """
    if not dates:
        dates = [datetime.now().strftime("%Y%m%d")]
    crt_de = datetime.now().strftime("%Y%m%d")

    session = _new_session()
    # 극장 목록: 조회 날짜 중 첫날 기준 1회 (극장 마스터는 날짜와 무관)
    theaters = fetch_theater_list(session, dates[0])
    total_theater_count = len(theaters)
    print(f"[Megabox-API] 극장 목록 {total_theater_count}개 확보")

    # (극장, 날짜) 조합을 작업 큐로
    tasks = [(t, d) for d in dates for t in theaters]
    collected_logs = []
    failures = []

    # 각 워커 스레드가 자기 세션을 갖도록 초기화
    import threading
    _local = threading.local()

    def _init_session():
        _local.session = _new_session()

    def _run(task):
        theater, play_de = task
        if stop_signal:
            stop_signal()
        s = getattr(_local, "session", None)
        if s is None:
            s = _new_session()
            _local.session = s
        try:
            json_data = fetch_schedule_json(s, theater["brchNo"], play_de, crt_de)
            stat = json_data.get("statCd") if json_data else None
            if stat not in (0, None):
                raise RuntimeError(f"statCd={stat}")
            log_id = _save_log(theater, play_de, json_data, crawler_run)
            time.sleep(_REQ_GAP)  # rate-limit 회피
            return ("ok", {"log_id": log_id, "date": play_de})
        except Exception as e:
            return ("fail", {
                "region": theater["areaNm"], "theater": theater["brchNm"],
                "date": play_de, "reason": f"API Error: {str(e)[:60]}",
                "worker": "API",
            })

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS,
                            initializer=_init_session) as ex:
        futures = [ex.submit(_run, t) for t in tasks]
        for fut in as_completed(futures):
            kind, payload = fut.result()
            if kind == "ok":
                collected_logs.append(payload)
            else:
                failures.append(payload)

    print(f"[Megabox-API] 수집 완료: {len(collected_logs)}/{len(tasks)} "
          f"(실패 {len(failures)})")
    return collected_logs, total_theater_count, failures
