import os
import time
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings

# Models
from crawler.models import CrawlerRunHistory, MovieSchedule, LotteScheduleLog
# Pipelines
from crawler.management.commands.run_cgv_pipeline import CGVPipelineService
from crawler.management.commands.run_lotte_pipeline import LottePipelineService
from crawler.management.commands.run_megabox_pipeline import MegaboxPipelineService

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
        
        total_collected = 0
        total_created = 0
        all_failures = []
        
        try:
            # --- CGV ---
            print("\n[Pipeline] 1. Running CGV...")
            cgv_logs, cgv_total, cgv_failures = CGVPipelineService.collect_schedule_logs(dates=target_dates)
            total_collected += len(cgv_logs)
            all_failures.extend(cgv_failures)
            
            # Transform CGV
            print(f"   ↳ Generating Schedules from {len(cgv_logs)} CGV logs...")
            cgv_created, cgv_errors = CGVPipelineService.transform_logs_to_schedule(
                log_ids=[l['log_id'] for l in cgv_logs if isinstance(l, dict) and 'log_id' in l]
            )
            total_created += cgv_created
            if cgv_errors:
                 print(f"   ⚠️ CGV Transform Errors: {len(cgv_errors)}")

            # --- Lotte ---
            print("\n[Pipeline] 2. Running Lotte...")
            # Pass crawler_run to link logs
            lotte_logs, lotte_total, lotte_failures = LottePipelineService.collect_schedule_logs(dates=target_dates, crawler_run=history)
            total_collected += len(lotte_logs)
            all_failures.extend(lotte_failures)
            
            # Transform Lotte (Manual Call as Service method is disabled)
            print(f"   ↳ Generating Schedules from {len(lotte_logs)} Lotte logs...")
            lotte_created = 0
            lotte_errors = []
            
            # Extract Log IDs from result (LotteService returns list of dicts or objects? 
            # It returns list of objects/dicts. In run_lotte_pipeline.py: collected_logs.extend(res_logs)
            # res_logs are dicts if from 'saved' list? No, Lotte worker returns list of dicts usually?
            # Let's check fetch_lotte_schedule_worker ret val.
            # It returns `collected_results` list of dicts `{'log_id': 'saved', 'date': ...}`? 
            # Wait, `fetch_lotte_schedule_worker` in `run_lotte_pipeline.py`: 
            # `collected_results.append({'log_id': 'saved', 'date': target_ymd})` -> It doesn't return ID?
            # Ah, `LotteScheduleLog.objects.create` is called inside. 
            # I should query logs by history ID since I passed `crawler_run`.
            
            lotte_db_logs = LotteScheduleLog.objects.filter(crawler_run=history)
            print(f"   ↳ Found {lotte_db_logs.count()} Lotte logs linked to this run.")
            
            for log in lotte_db_logs:
                try:
                    # Using static method from MovieSchedule if available, or class method from views?
                    # views.py uses `MovieSchedule.create_from_lotte_log(log, title_map=...)`
                    # We can use MovieSchedule directly.
                    # Note: We need title_map for best results, but for automation we might skip or use simple one.
                    # Let's assume standard creation.
                    cnt, errs = MovieSchedule.create_from_lotte_log(log) 
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
                    cnt, errs = MovieSchedule.create_from_megabox_log(log)
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
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.stdout.write(self.style.ERROR(f"\n❌ Pipeline Failed: {e}"))
            
            history.status = 'FAILED'
            history.error_message = str(e)
            history.finished_at = timezone.now()
            history.save()
