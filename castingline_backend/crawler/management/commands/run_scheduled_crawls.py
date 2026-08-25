# -*- coding: utf-8 -*-
"""C007: 자동 크롤링 디스패처.

크론에서 5분마다 실행된다. 관리자 화면의 스케줄 설정(CrawlerScheduleConfig)을
읽어, 설정된 실행 시각(다중)이 도래했으면 데일리 파이프라인
(CGV → 롯데 → 메가박스 → 일반극장)을 순차 실행한다.

- On/Off: enabled=False 면 아무것도 하지 않는다 (당일 스킵, 다시 켜면 다음
  예정 시각부터 실행).
- 수집 일수: 내일(D+1)부터 crawl_days 일치.
- 같은 시각이 하루에 두 번 돌지 않도록 last_runs 에 실행 기록을 남기고,
  파일 잠금으로 파이프라인 동시 실행을 막는다. 앞선 실행이 길어져 예정
  시각을 놓친 경우를 위해 도래 판정 창은 60분으로 둔다 (놓친 시각은 잠금이
  풀린 다음 틱에 늦게라도 실행).
"""
import re
from datetime import datetime, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

# 예정 시각 도래 판정 창(분) — 앞선 실행이 길어져 놓친 시각도 이 창 안이면 실행
WINDOW_MINUTES = 60
LOCK_PATH = "/tmp/clms_scheduled_crawl.lock"


class Command(BaseCommand):
    help = "자동 크롤링 디스패처 (5분마다 크론 실행, 설정된 시각 도래 시 데일리 파이프라인 구동)"

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true',
                            help='시각/실행기록 무시하고 즉시 1회 실행 (테스트용)')

    def handle(self, *args, **options):
        from crawler.models import CrawlerScheduleConfig
        from crawler.management.commands.run_daily_pipeline import run_site_pipeline

        config = CrawlerScheduleConfig.get()
        now = timezone.localtime()

        if not config.enabled and not options.get('force'):
            return  # Off — 조용히 스킵 (5분마다 돌므로 로그 남기지 않음)

        run_times = [t for t in (config.run_times or [])
                     if re.fullmatch(r"\d{1,2}:\d{2}", str(t))]
        if not run_times and not options.get('force'):
            return

        # 파이프라인 동시 실행 방지 (Linux 전용 flock — 개발 Windows에선 무시)
        lock_file = None
        try:
            import fcntl
            lock_file = open(LOCK_PATH, "w")
            try:
                fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                return  # 이전 실행이 진행 중 — 기록을 남기지 않고 다음 틱에 재시도
        except ImportError:
            pass

        try:
            due = []
            today = now.strftime("%Y-%m-%d")
            if options.get('force'):
                due = ["(수동)"]
            else:
                for t in run_times:
                    hh, mm = t.split(":")
                    sched = now.replace(hour=int(hh), minute=int(mm),
                                        second=0, microsecond=0)
                    delta = (now - sched).total_seconds()
                    if 0 <= delta < WINDOW_MINUTES * 60 and config.last_runs.get(t) != today:
                        due.append(t)

            if not due:
                return

            # 실행 기록을 먼저 남긴다 (파이프라인 도중 다음 틱이 겹쳐도 중복 방지)
            if not options.get('force'):
                last_runs = dict(config.last_runs or {})
                for t in due:
                    last_runs[t] = today
                config.last_runs = last_runs
                config.save(update_fields=['last_runs', 'updated_at'])

            days = max(1, min(int(config.crawl_days or 3), 14))
            base = datetime.now().date()
            target_dates = [(base + timedelta(days=d)).strftime("%Y%m%d")
                            for d in range(1, days + 1)]

            self.stdout.write(
                f"🕐 자동 크롤링 시작 (예정 시각 {', '.join(due)} / 대상 {target_dates})")
            for site in ('cgv', 'lotte', 'megabox', 'kobis'):
                try:
                    run_site_pipeline(site, target_dates=target_dates)
                except Exception as e:
                    self.stderr.write(f"❌ {site} 파이프라인 실패: {e}")
            self.stdout.write("✅ 자동 크롤링 종료")
        finally:
            if lock_file is not None:
                lock_file.close()
