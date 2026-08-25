import requests
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings

# Models
from crawler.models import (
    CrawlerRunHistory, MovieSchedule, CrawlTargetMovie,
    CGVScheduleLog, LotteScheduleLog, MegaboxScheduleLog,
)
# Pipelines
from crawler.management.commands.run_cgv_pipeline import CGVPipelineService
from crawler.management.commands.run_lotte_pipeline import LottePipelineService
from crawler.management.commands.run_megabox_pipeline import MegaboxPipelineService
from crawler.management.commands.run_kobis_pipeline import KobisPipelineService

# 사이트 키 → 표시명 (이력 목록/Slack에 그대로 노출)
SITE_LABELS = {
    'cgv': 'CGV',
    'lotte': '롯데',
    'megabox': '메가박스',
    'kobis': '일반극장',
}

# 재시도해도 소용없는 스킵 사유 (실패로 집계하지 않음)
SKIP_REASONS = {"Date Button Disabled", "Date Button Not Found"}


def _send_site_slack(site_label, target_dates=None, collected=0, created=0,
                     failures=None, success=True, error_msg=""):
    """사이트별 파이프라인 결과 Slack 알림"""
    token = getattr(settings, 'SLACK_BOT_TOKEN', '')
    channel = getattr(settings, 'SLACK_CHANNEL_ID', '')
    if not token or not channel:
        print(f"[{site_label} Slack] {'✅ SUCCESS' if success else '❌ FAILED'} | collected={collected}, created={created}")
        return

    failures = failures or []
    dates_str = ", ".join(target_dates) if target_dates else "Unknown"

    if success:
        fail_lines = ""
        if failures:
            samples = failures[:10]
            fail_lines = "\n".join(f"• [{f.get('theater','?')}] {f.get('date','?')}: {f.get('reason','?')[:40]}" for f in samples)
            if len(failures) > 10:
                fail_lines += f"\n... 외 {len(failures) - 10}건"

        text = (
            f"✅ [Daily {site_label}] 완료\n"
            f"📅 대상: {dates_str}\n"
            f"📦 수집 로그: {collected}건 | 🎬 스케줄 생성: {created}건\n"
            f"⚠️ 실패: {len(failures)}건" + (f"\n{fail_lines}" if fail_lines else "")
        )
        blocks = [
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*✅ [Daily {site_label}] 수집 완료*\n📅 {dates_str}"}},
            {"type": "section", "fields": [
                {"type": "mrkdwn", "text": f"*수집 로그:*\n{collected}건"},
                {"type": "mrkdwn", "text": f"*스케줄 생성:*\n{created}건"},
                {"type": "mrkdwn", "text": f"*실패:*\n{len(failures)}건"},
            ]},
        ]
        if fail_lines:
            blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": f"*⚠️ 실패 상세 (상위 10건):*\n{fail_lines}"}})
    else:
        text = f"❌ [Daily {site_label}] 실패\n📅 {dates_str}\n오류: {error_msg[:200]}"
        blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": f"*❌ [Daily {site_label}] 파이프라인 실패*\n📅 {dates_str}\n```{error_msg[:300]}```"}}]

    try:
        requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"channel": channel, "text": text, "blocks": blocks},
            timeout=10
        )
    except Exception as e:
        print(f"[{site_label} Slack] 전송 실패: {e}")


def _get_target_dates():
    """수집 대상 날짜: 내일 ~ D+3 (3일)"""
    today = datetime.now().date()
    return [(today + timedelta(days=d)).strftime("%Y%m%d") for d in range(1, 4)]


def _get_target_titles():
    """크롤 대상 영화 제목 목록 (활성화된 것만). 미지정 시 None → 전체 저장"""
    active_targets = list(CrawlTargetMovie.objects.filter(is_active=True))
    if not active_targets:
        print("🎬 크롤 대상 영화 미지정 → 전체 저장")
        return None
    titles = []
    for tm in active_targets:
        clean_t, _ = MovieSchedule.parse_and_normalize_title(tm.title)
        titles.append(clean_t)
    print(f"🎬 크롤 대상 {len(titles)}편: {titles}")
    return titles


def _collect_and_transform(site, history, target_dates, target_titles):
    """사이트별 수집 + 스케줄 변환. Returns: (collected_cnt, created_cnt, failures)"""
    if site == 'cgv':
        logs, _total, failures = CGVPipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
        db_logs = list(CGVScheduleLog.objects.filter(crawler_run=history))
        print(f"   ↳ Generating Schedules from {len(db_logs)} CGV logs...")
        # 0825: 완전 교체 — 수집된 날짜의 기존 스케줄을 지우고 최신 수집분으로 다시 채운다
        MovieSchedule.replace_before_transform(['CGV'], sorted({l.query_date for l in db_logs}))
        created, errors = 0, []
        for log in db_logs:
            try:
                cnt, errs = MovieSchedule.create_from_cgv_log(log, target_titles=target_titles)
                created += cnt
                errors.extend(errs)
            except Exception as e:
                errors.append({'error': str(e)})

    elif site == 'lotte':
        logs, _total, failures = LottePipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
        db_logs = list(LotteScheduleLog.objects.filter(crawler_run=history))
        print(f"   ↳ Generating Schedules from {len(db_logs)} Lotte logs...")
        # 0825: 완전 교체
        MovieSchedule.replace_before_transform(['LOTTE'], sorted({l.query_date for l in db_logs}))
        created, errors = 0, []
        for log in db_logs:
            try:
                cnt, errs = MovieSchedule.create_from_lotte_log(log, target_titles=target_titles)
                created += cnt
                errors.extend(errs)
            except Exception as e:
                errors.append({'error': str(e)})

    elif site == 'megabox':
        logs, _total, failures = MegaboxPipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
        db_logs = list(MegaboxScheduleLog.objects.filter(crawler_run=history))
        print(f"   ↳ Generating Schedules from {len(db_logs)} Megabox logs...")
        # 0825: 완전 교체
        MovieSchedule.replace_before_transform(['MEGABOX'], sorted({l.query_date for l in db_logs}))
        created, errors = 0, []
        for log in db_logs:
            try:
                cnt, errs = MovieSchedule.create_from_megabox_log(log, target_titles=target_titles)
                created += cnt
                errors.extend(errs)
            except Exception as e:
                errors.append({'error': str(e)})

    elif site == 'kobis':
        logs, theaters, failures = KobisPipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
        print(f"   ↳ Generating Schedules from {len(logs)} KOBIS logs ({theaters} theaters)...")
        # 0825: 완전 교체 (데일리는 일반극장만 수집하므로 일반극장 범위만)
        MovieSchedule.replace_before_transform(['일반극장'], sorted({c['date'] for c in logs}))
        created, errors = KobisPipelineService.transform_logs_to_schedule(
            log_ids=[c['log_id'] for c in logs],
            target_titles=target_titles,
        )
    else:
        raise ValueError(f"Unknown site: {site}")

    if errors:
        print(f"   ⚠️ {SITE_LABELS[site]} Transform Errors: {len(errors)}")

    label = SITE_LABELS[site]
    for f in failures:
        f['brand'] = label

    return len(logs), created, failures


def run_site_pipeline(site, target_dates=None, target_titles=None):
    """
    사이트 1개를 독립 실행: 이력 레코드 생성 → 수집 → 변환 → 결과 저장 → Slack.
    사이트별로 이력이 따로 남으므로 목록에서도 따로 조회된다.
    """
    label = SITE_LABELS[site]
    if target_dates is None:
        target_dates = _get_target_dates()
    if target_titles is None:
        target_titles = _get_target_titles()

    print(f"\n🚀 [Daily {label}] Starting for: {target_dates}")

    history = CrawlerRunHistory.objects.create(
        status='RUNNING',
        trigger_type='SCHEDULED',
        configuration={
            'target_dates': target_dates,
            'mode': 'Daily Automation',
            'site': label,
            'brands': [label],
        }
    )
    print(f"✅ History Created: ID #{history.id} ({label})")

    try:
        collected, created, failures = _collect_and_transform(site, history, target_dates, target_titles)

        real_failures = [f for f in failures if f.get('reason') not in SKIP_REASONS]
        skipped = [f for f in failures if f.get('reason') in SKIP_REASONS]

        history.status = 'SUCCESS'
        history.finished_at = timezone.now()
        history.result_summary = {
            'site': label,
            'total_collected': collected,
            'total_created': created,
            'total_failures': len(real_failures),
            'total_skipped': len(skipped),
            'failure_summary': [
                {
                    'brand': f.get('brand', ''),
                    'theater': f.get('theater', ''),
                    'date': f.get('date', ''),
                    'reason': f.get('reason', '')
                }
                for f in real_failures[:20]
            ],
        }
        history.save()

        print(f"✅ [Daily {label}] Finished. Collected: {collected}, Created: {created}, Failures: {len(real_failures)}")

        _send_site_slack(label, target_dates=target_dates, collected=collected,
                         created=created, failures=real_failures, success=True)
        return True

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ [Daily {label}] Failed: {e}")

        history.status = 'FAILED'
        history.error_message = str(e)
        history.finished_at = timezone.now()
        history.save()

        _send_site_slack(label, target_dates=target_dates, success=False, error_msg=str(e))
        return False


class Command(BaseCommand):
    help = 'Run Daily Schedule Pipeline. --site 지정 시 해당 사이트만, 미지정 시 4개 전부 순차 실행 (이력은 사이트별 개별 생성)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--site', type=str, choices=list(SITE_LABELS.keys()),
            help='실행할 사이트 (cgv/lotte/megabox/kobis). 미지정 시 전체 순차 실행'
        )

    def handle(self, *args, **options):
        site = options.get('site')
        target_dates = _get_target_dates()
        target_titles = _get_target_titles()

        if site:
            ok = run_site_pipeline(site, target_dates, target_titles)
            if ok:
                self.stdout.write(self.style.SUCCESS(f"✅ {SITE_LABELS[site]} Pipeline Finished."))
            else:
                self.stdout.write(self.style.ERROR(f"❌ {SITE_LABELS[site]} Pipeline Failed."))
        else:
            # 전체 실행이어도 사이트별로 이력을 따로 남긴다
            results = {}
            for s in SITE_LABELS.keys():
                results[s] = run_site_pipeline(s, target_dates, target_titles)
            ok_cnt = sum(1 for v in results.values() if v)
            self.stdout.write(self.style.SUCCESS(f"\n✅ All Pipelines Finished. ({ok_cnt}/{len(results)} 성공)"))
