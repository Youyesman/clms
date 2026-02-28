import os
import time
import requests
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings

# Models
from crawler.models import CrawlerRunHistory, MovieSchedule, LotteScheduleLog, CrawlTargetMovie
# Pipelines
from crawler.management.commands.run_cgv_pipeline import CGVPipelineService
from crawler.management.commands.run_lotte_pipeline import LottePipelineService
from crawler.management.commands.run_megabox_pipeline import MegaboxPipelineService


def _send_daily_slack(target_dates=None, total_collected=0, total_created=0,
                      cgv_created=0, lotte_created=0, mega_created=0,
                      all_failures=None, success=True, error_msg=""):
    """데일리 파이프라인 통합 결과 Slack 알림"""
    token = getattr(settings, 'SLACK_BOT_TOKEN', '')
    channel = getattr(settings, 'SLACK_CHANNEL_ID', '')
    if not token or not channel:
        print(f"[Daily Slack] {'✅ SUCCESS' if success else '❌ FAILED'} | collected={total_collected}, created={total_created}")
        return

    all_failures = all_failures or []
    dates_str = ", ".join(target_dates) if target_dates else "Unknown"

    if success:
        fail_lines = ""
        if all_failures:
            samples = all_failures[:10]
            fail_lines = "\n".join(f"• [{f.get('theater','?')}] {f.get('date','?')}: {f.get('reason','?')[:40]}" for f in samples)
            if len(all_failures) > 10:
                fail_lines += f"\n... 외 {len(all_failures) - 10}건"

        text = (
            f"✅ [Daily Pipeline] 완료\n"
            f"📅 대상: {dates_str}\n"
            f"📦 수집 로그: {total_collected}건 | 🎬 스케줄 생성: {total_created}건\n"
            f"  CGV {cgv_created} / 롯데 {lotte_created} / 메가박스 {mega_created}\n"
            f"⚠️ 실패: {len(all_failures)}건" + (f"\n{fail_lines}" if fail_lines else "")
        )
        blocks = [
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*✅ [Daily Pipeline] 수집 완료*\n📅 {dates_str}"}},
            {"type": "section", "fields": [
                {"type": "mrkdwn", "text": f"*수집 로그:*\n{total_collected}건"},
                {"type": "mrkdwn", "text": f"*스케줄 생성:*\n{total_created}건"},
                {"type": "mrkdwn", "text": f"*CGV:*\n{cgv_created}건"},
                {"type": "mrkdwn", "text": f"*롯데:*\n{lotte_created}건"},
                {"type": "mrkdwn", "text": f"*메가박스:*\n{mega_created}건"},
                {"type": "mrkdwn", "text": f"*실패:*\n{len(all_failures)}건"},
            ]},
        ]
        if fail_lines:
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*⚠️ 실패 상세 (상위 10건):*\n{fail_lines}"}})
    else:
        text = f"❌ [Daily Pipeline] 실패\n📅 {dates_str}\n오류: {error_msg[:200]}"
        blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": f"*❌ [Daily Pipeline] 파이프라인 실패*\n📅 {dates_str}\n```{error_msg[:300]}```"}}]

    try:
        requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"channel": channel, "text": text, "blocks": blocks},
            timeout=10
        )
    except Exception as e:
        print(f"[Daily Slack] 전송 실패: {e}")


class Command(BaseCommand):
    help = 'Run Daily Schedule Pipeline (Crawl -> Log -> Transform) for 3 days starting Tomorrow'

    def handle(self, *args, **options):
        # 1. Date Calculation (Tomorrow ~ D+3)
        today = datetime.now().date()
        start_date = today + timedelta(days=1)
        end_date = today + timedelta(days=3) # D+1, D+2, D+3 (3 days)
        
        target_dates = []
        curr = start_date
        while curr <= end_date:
            target_dates.append(curr.strftime("%Y%m%d"))
            curr += timedelta(days=1)
            
        self.stdout.write(self.style.SUCCESS(f"🚀 Starting Daily Pipeline for: {target_dates}"))
        
        # 2. Create History
        history = CrawlerRunHistory.objects.create(
            status='RUNNING',
            trigger_type='SCHEDULED', # CRON Trigger
            configuration={
                'target_dates': target_dates,
                'mode': 'Daily Automation',
                'brands': ['CGV', 'LOTTE', 'MEGABOX']
            }
        )
        print(f"✅ History Created: ID #{history.id}")
        
        # 크롤 대상 영화 목록 조회 (활성화된 것만) - 모든 극장 공통 적용
        active_targets = list(CrawlTargetMovie.objects.filter(is_active=True))
        if active_targets:
            target_titles = []
            for tm in active_targets:
                clean_t, _ = MovieSchedule.parse_and_normalize_title(tm.title)
                target_titles.append(clean_t)
            cgv_target_titles = lotte_target_titles = mega_target_titles = target_titles
            print(f"🎬 크롤 대상 {len(target_titles)}편: {target_titles}")
        else:
            cgv_target_titles = lotte_target_titles = mega_target_titles = None
            print("🎬 크롤 대상 영화 미지정 → 전체 저장")

        total_collected = 0
        total_created = 0
        all_failures = []

        try:
            # --- CGV ---
            print("\n[Pipeline] 1. Running CGV...")
            cgv_logs, cgv_total, cgv_failures = CGVPipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
            total_collected += len(cgv_logs)
            all_failures.extend(cgv_failures)

            # Transform CGV: crawler_run으로 연결된 로그를 직접 조회
            from crawler.models import CGVScheduleLog
            cgv_db_logs = CGVScheduleLog.objects.filter(crawler_run=history)
            print(f"   ↳ Generating Schedules from {cgv_db_logs.count()} CGV logs...")
            cgv_created = 0
            cgv_errors = []
            for log in cgv_db_logs:
                try:
                    cnt, errs = MovieSchedule.create_from_cgv_log(log, target_titles=cgv_target_titles)
                    cgv_created += cnt
                    cgv_errors.extend(errs)
                except Exception as e:
                    cgv_errors.append({'error': str(e)})
            total_created += cgv_created
            if cgv_errors:
                print(f"   ⚠️ CGV Transform Errors: {len(cgv_errors)}")

            # --- Lotte ---
            print("\n[Pipeline] 2. Running Lotte...")
            lotte_logs, lotte_total, lotte_failures = LottePipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
            total_collected += len(lotte_logs)
            all_failures.extend(lotte_failures)

            # Transform Lotte: crawler_run으로 연결된 로그를 직접 조회
            lotte_db_logs = LotteScheduleLog.objects.filter(crawler_run=history)
            print(f"   ↳ Generating Schedules from {lotte_db_logs.count()} Lotte logs linked to this run.")
            lotte_created = 0
            lotte_errors = []

            for log in lotte_db_logs:
                try:
                    # Using static method from MovieSchedule if available, or class method from views?
                    # views.py uses `MovieSchedule.create_from_lotte_log(log, title_map=...)`
                    # We can use MovieSchedule directly.
                    # Note: We need title_map for best results, but for automation we might skip or use simple one.
                    # Let's assume standard creation.
                    cnt, errs = MovieSchedule.create_from_lotte_log(log, target_titles=lotte_target_titles)
                    lotte_created += cnt
                    lotte_errors.extend(errs)
                except Exception as e:
                    lotte_errors.append({'error': str(e)})
            
            total_created += lotte_created
            if lotte_errors:
                print(f"   ⚠️ Lotte Transform Errors: {len(lotte_errors)}")

            # --- Megabox ---
            print("\n[Pipeline] 3. Running Megabox...")
            mega_logs, mega_total, mega_failures = MegaboxPipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
            total_collected += len(mega_logs)
            all_failures.extend(mega_failures)
            
            # Transform Megabox
            # Megabox Service also returns list of dicts.
            # But we passed crawler_run, so we can query by history.
            print(f"   ↳ Generating Schedules from Megabox logs...")
            from crawler.models import MegaboxScheduleLog
            mega_db_logs = MegaboxScheduleLog.objects.filter(crawler_run=history)
            
            mega_created = 0
            mega_errors = []
            for log in mega_db_logs:
                try:
                    cnt, errs = MovieSchedule.create_from_megabox_log(log, target_titles=mega_target_titles)
                    mega_created += cnt
                    mega_errors.extend(errs)
                except Exception as e:
                    mega_errors.append({'error': str(e)})
                    
            total_created += mega_created
            if mega_errors:
                print(f"   ⚠️ Megabox Transform Errors: {len(mega_errors)}")

            # --- Finalize ---
            history.status = 'SUCCESS'
            history.finished_at = timezone.now()
            history.result_summary = {
                'total_collected': total_collected,
                'total_created': total_created,
                'cgv_created': cgv_created,
                'lotte_created': lotte_created,
                'mega_created': mega_created,
                'failures_count': len(all_failures)
            }
            history.save()

            self.stdout.write(self.style.SUCCESS(f"\n✅ Pipeline Finished Successfully."))
            self.stdout.write(f"   - Logs Collected: {total_collected}")
            self.stdout.write(f"   - Schedules Created: {total_created}")

            # 통합 Slack 알림
            _send_daily_slack(
                target_dates=target_dates,
                total_collected=total_collected,
                total_created=total_created,
                cgv_created=cgv_created,
                lotte_created=lotte_created,
                mega_created=mega_created,
                all_failures=all_failures,
                success=True
            )

        except Exception as e:
            import traceback
            traceback.print_exc()
            self.stdout.write(self.style.ERROR(f"\n❌ Pipeline Failed: {e}"))

            history.status = 'FAILED'
            history.error_message = str(e)
            history.finished_at = timezone.now()
            history.save()

            _send_daily_slack(target_dates=target_dates, success=False, error_msg=str(e))
