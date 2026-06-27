"""
KOBIS(영화관입장권 통합전산망) 극장별 시간표 크롤러.
findTheaterSchedule.do 페이지의 AJAX 캐스케이드(광역→기초→상영관→스케줄)를 순회한다.
- Playwright 불필요 (순수 requests + JSON).
- CGV/롯데/메가박스 체인 극장은 제외하고 일반극장만 수집한다. (brand='일반극장')
"""
import re
import time
import requests
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from concurrent.futures import ThreadPoolExecutor

from crawler.models import KobisScheduleLog

BASE = "https://www.kobis.or.kr"
PAGE = BASE + "/kobis/business/mast/thea/findTheaterSchedule.do"
THEA = BASE + "/kobis/business/mast/thea/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": PAGE,
    "X-Requested-With": "XMLHttpRequest",
}

# 전국 17개 광역 코드 (시도)
WIDE_AREA_CODES = [f"0105{i:03d}" for i in range(1, 18)]


def _is_chain_theater(name):
    """CGV/롯데/메가박스 체인 극장인지 (제외 대상). CINE de CHEF=메가박스 계열."""
    norm = re.sub(r"\s+", "", str(name or ""))
    low = norm.lower()
    return (
        norm.startswith("CGV")
        or norm.startswith("메가박스")
        or norm.startswith("롯데")
        or low.startswith("cinedechef")
        or "씨네드쉐프" in norm
        or "씨네드셰프" in norm
    )


def _new_session():
    """KOBIS 세션 생성 + CSRFToken 확보."""
    s = requests.Session()
    r = s.get(PAGE, headers=HEADERS, timeout=20)
    m = re.search(r"CSRFToken=([A-Za-z0-9_\-]+)", r.text)
    token = m.group(1) if m else ""
    return s, token


def _post(session, token, endpoint, data):
    url = f"{THEA}{endpoint}.do?CSRFToken={token}"
    resp = session.post(url, data=data, headers=HEADERS, timeout=20)
    return resp.json()


def crawl_widearea(widearea_cd, dates, stop_signal=None, crawler_run=None):
    """단일 광역 처리: 기초→상영관(일반극장만)→날짜별 스케줄 수집 후 로그 저장."""
    collected, failures = [], []
    theater_count = 0
    try:
        session, token = _new_session()
        basareas = _post(session, token, "findBasareaCdList", {"sWideareaCd": widearea_cd}).get("basareaCdList", [])
    except Exception as e:
        return collected, failures, theater_count

    for ba in basareas:
        if stop_signal:
            stop_signal()
        try:
            theas = _post(session, token, "findTheaCdList",
                          {"sWideareaCd": widearea_cd, "sBasareaCd": ba["cd"]}).get("theaCdList", [])
        except Exception:
            continue

        for th in theas:
            thea_cd, thea_nm = th["cd"], th["cdNm"]
            if _is_chain_theater(thea_nm):
                continue  # 체인 극장 제외 (기존 크롤러가 처리)
            theater_count += 1

            for ymd in dates:
                if stop_signal:
                    stop_signal()
                try:
                    sc = _post(session, token, "findSchedule", {"theaCd": thea_cd, "showDt": ymd})
                    if not sc.get("schedule"):
                        # 상영 없음도 정상 (저장은 하되 빈 schedule)
                        pass
                    close_old_connections()
                    log, created = KobisScheduleLog.objects.update_or_create(
                        query_date=ymd,
                        site_code=thea_cd,
                        defaults={
                            "theater_name": thea_nm,
                            "response_json": sc,
                            "status": "success",
                            "crawler_run": crawler_run,
                        },
                    )
                    collected.append({"log_id": log.id, "date": ymd})
                except Exception as e:
                    failures.append({
                        "region": widearea_cd, "theater": thea_nm, "date": ymd,
                        "reason": str(e)[:60], "worker": widearea_cd,
                    })
                time.sleep(0.15)  # 서버 부하 방지
    return collected, failures, theater_count


class KobisPipelineService:

    @classmethod
    def collect_schedule_logs(cls, dates=None, stop_signal=None, crawler_run=None):
        """전국 광역 병렬 순회 → KobisScheduleLog 저장. Returns (collected, total_theaters, failures)."""
        if not dates:
            dates = [datetime.now().strftime("%Y%m%d")]

        collected, failures = [], []
        total_theaters = 0
        with ThreadPoolExecutor(max_workers=6) as ex:
            futures = [
                ex.submit(crawl_widearea, wc, dates, stop_signal, crawler_run)
                for wc in WIDE_AREA_CODES
            ]
            for f in futures:
                try:
                    c, fl, cnt = f.result()
                    collected.extend(c)
                    failures.extend(fl)
                    total_theaters += cnt
                except Exception as e:
                    print(f"[KOBIS] worker 실패: {e}")

        print(f"[KOBIS] 수집 완료 - 일반극장 {total_theaters}곳 / 로그 {len(collected)}건 / 실패 {len(failures)}건")
        return collected, total_theaters, failures

    @staticmethod
    def transform_logs_to_schedule(log_ids=None, target_titles=None):
        """KobisScheduleLog -> MovieSchedule(brand='일반극장') 변환."""
        from crawler.models import MovieSchedule
        if log_ids:
            logs = KobisScheduleLog.objects.filter(id__in=log_ids)
        else:
            logs = KobisScheduleLog.objects.filter(created_at__date=datetime.now().date())
        total, errors = 0, []
        title_map = {}
        for log in logs:
            try:
                cnt, errs = MovieSchedule.create_from_kobis_log(log, target_titles=target_titles, title_map=title_map)
                total += cnt
                errors.extend(errs)
            except Exception as e:
                errors.append({"theater": log.theater_name, "error": str(e), "log_id": log.id})
        return total, errors

    @classmethod
    def send_slack_message(cls, message_type, data):
        # 기존 파이프라인과 시그니처 호환용. 별도 Slack 설정 없으면 콘솔 출력.
        print(f"[KOBIS Slack:{message_type}] {data if message_type != 'SUCCESS' else {k: data.get(k) for k in ('collected', 'total_master')}}")


class Command(BaseCommand):
    help = "KOBIS 일반극장 시간표 크롤링 (광역→기초→상영관→스케줄)"

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='단일 날짜 (YYYYMMDD)')
        parser.add_argument('--start-date', type=str, help='시작 날짜 (YYYYMMDD)')
        parser.add_argument('--end-date', type=str, help='종료 날짜 (YYYYMMDD)')
        parser.add_argument('--transform', action='store_true', help='수집 후 MovieSchedule 변환까지 수행')

    def handle(self, *args, **options):
        if options.get('start_date') and options.get('end_date'):
            start = datetime.strptime(options['start_date'], "%Y%m%d")
            end = datetime.strptime(options['end_date'], "%Y%m%d")
            dates, cur = [], start
            while cur <= end:
                dates.append(cur.strftime("%Y%m%d"))
                cur += timedelta(days=1)
        elif options.get('date'):
            dates = [options['date']]
        else:
            dates = [(datetime.now() + timedelta(days=i)).strftime("%Y%m%d") for i in range(3)]

        self.stdout.write(f"🎬 KOBIS 일반극장 크롤링 시작: {dates}")
        collected, total, failures = KobisPipelineService.collect_schedule_logs(dates=dates)
        self.stdout.write(self.style.SUCCESS(f"수집: 로그 {len(collected)}건 / 일반극장 {total}곳 / 실패 {len(failures)}건"))

        if options.get('transform'):
            from crawler.models import CrawlTargetMovie
            targets = list(CrawlTargetMovie.objects.filter(is_active=True).values_list('title', flat=True)) or None
            created, errors = KobisPipelineService.transform_logs_to_schedule(
                log_ids=[c['log_id'] for c in collected], target_titles=targets
            )
            self.stdout.write(self.style.SUCCESS(f"변환: MovieSchedule {created}건 생성/갱신 (에러 {len(errors)})"))
