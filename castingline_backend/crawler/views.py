from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import FileResponse, Http404
from django.utils import timezone
from datetime import datetime, timedelta
import logging
import threading
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import Models & Pipeline Services
from crawler.models import CrawlerRunHistory, CrawlTargetMovie, MovieSchedule
from crawler.management.commands.run_cgv_pipeline import CGVPipelineService
from crawler.management.commands.run_lotte_pipeline import LottePipelineService
from crawler.management.commands.run_megabox_pipeline import MegaboxPipelineService

# Import Utils
from crawler.utils.excel_exporter import export_schedules_to_excel

logger = logging.getLogger(__name__)

def run_crawler_background(history_id, data):
    """
    백그라운드에서 실행될 크롤러 로직
    """
    try:
        # 0. Retrieve History Object
        history = CrawlerRunHistory.objects.get(id=history_id)
        history.status = 'RUNNING'
        history.save()

        # 1. Parse Dates
        start_date_str = data.get('crawlStartDate')
        end_date_str = data.get('crawlEndDate')
        
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")

        # Generate date list
        date_list = []
        curr = start_date
        while curr <= end_date:
            date_list.append(curr.strftime("%Y%m%d"))
            curr += timedelta(days=1)
            
        # 2. Parse Company Choice
        choice_company = data.get('choiceCompany', {})
        run_cgv = choice_company.get('cgv', False)
        run_lotte = choice_company.get('lotte', False)
        run_mega = choice_company.get('mega', False)
        
        # 3. Parse Movie Settings (Target Titles)
        movie_settings = data.get('movieSettings', [])
        target_titles = set()
        for setting in movie_settings:
            val = setting.get('movieName')
            if val:
                target_titles.add(val)
            for rival in setting.get('rivalMovieNames', []):
                target_titles.add(rival)
        
        target_titles_list = list(target_titles) if target_titles else None
        
        all_failures = []
        executed_companies = []
        companies_for_export = []
        
        # Stop Signal Helper
        def check_stop_signal():
            h = CrawlerRunHistory.objects.get(id=history_id)
            if h.status == 'STOP_REQUESTED':
                raise InterruptedError("User requested stop")
            return False

        # Execute Pipelines
        # Execute Pipelines in Parallel
        def run_cgv_wrapper():
            if not run_cgv: return None
            try:
                check_stop_signal()
                print(f"Executing CGV for {date_list}")
                logs, cnt, failures = CGVPipelineService.collect_schedule_logs(dates=date_list, stop_signal=check_stop_signal)
                check_stop_signal()
                
                CGVPipelineService.send_slack_message("SUCCESS", {
                    "collected": len(logs),
                    "collected_list": logs,  # [FIX] Pass logs for date-wise breakdown
                    "created": 0,
                    "failures": failures,
                    "total_master": cnt
                })
                return 'CGV', failures
            except InterruptedError:
                raise
            except Exception as e:
                CGVPipelineService.send_slack_message("ERROR", {"errors": [{"theater": "Global", "movie": "Unknown", "error": str(e)}]})
                logger.error(f"CGV Failure: {e}")
                return None

        def run_lotte_wrapper():
            if not run_lotte: return None
            try:
                check_stop_signal()
                print(f"Executing Lotte for {date_list}")
                logs, cnt, failures = LottePipelineService.collect_schedule_logs(dates=date_list, stop_signal=check_stop_signal)
                check_stop_signal()
                
                LottePipelineService.send_slack_message("SUCCESS", {
                    "collected": len(logs),
                    "collected_list": logs, # [FIX] Pass logs for date-wise breakdown
                    "created": 0,
                    "failures": failures,
                    "total_master": cnt
                })
                return 'Lotte', failures
            except InterruptedError:
                raise
            except Exception as e:
                LottePipelineService.send_slack_message("ERROR", {"errors": [{"theater": "Global", "movie": "Unknown", "error": str(e)}]})
                logger.error(f"Lotte Failure: {e}")
                return None

        def run_mega_wrapper():
            if not run_mega: return None
            try:
                check_stop_signal()
                print(f"Executing Megabox for {date_list}")
                logs, cnt, failures = MegaboxPipelineService.collect_schedule_logs(dates=date_list, stop_signal=check_stop_signal)
                check_stop_signal()
                
                MegaboxPipelineService.send_slack_message("SUCCESS", {
                    "collected": len(logs),
                    "collected_list": logs, # [FIX] Pass logs for date-wise breakdown
                    "created": 0,
                    "failures": failures,
                    "total_master": cnt
                })
                return 'Megabox', failures
            except InterruptedError:
                raise
            except Exception as e:
                MegaboxPipelineService.send_slack_message("ERROR", {"errors": [{"theater": "Global", "movie": "Unknown", "error": str(e)}]})
                logger.error(f"Megabox Failure: {e}")
                return None

        # Run Parallel
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = []
            if run_cgv: futures.append(executor.submit(run_cgv_wrapper))
            if run_lotte: futures.append(executor.submit(run_lotte_wrapper))
            if run_mega: futures.append(executor.submit(run_mega_wrapper))
            
            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result:
                        comp_name, comp_failures = result
                        executed_companies.append(comp_name)
                        if comp_failures:
                            # [USER REQUEST] Inject Brand for Failures Sheet
                            for f in comp_failures:
                                f['brand'] = comp_name
                            all_failures.extend(comp_failures)
                            
                        if comp_name == 'CGV': companies_for_export.append('CGV')
                        elif comp_name == 'Lotte': companies_for_export.append('LOTTE')
                        elif comp_name == 'Megabox': companies_for_export.append('MEGABOX')
                except InterruptedError:
                    raise
                except Exception as e:
                    logger.error(f"Parallel Execution Error: {e}")
                
        # 4. Generate Excel (raw crawl log)
        check_stop_signal()
        excel_path = export_schedules_to_excel(
            start_date_str=start_date_str,
            end_date_str=end_date_str,
            companies=companies_for_export,
            target_titles=target_titles_list,
            failures=all_failures
        )

        # 5. Auto Transform: 크롤 완료 후 자동으로 스케줄 생성
        check_stop_signal()
        transform_results = {}
        total_created = 0

        # 크롤 대상 영화 기반 target_titles 조회
        from crawler.models import CrawlTargetMovie
        active_targets = list(CrawlTargetMovie.objects.filter(is_active=True))
        if active_targets:
            crawl_target_titles = []
            for tm in active_targets:
                clean_t, _ = MovieSchedule.parse_and_normalize_title(tm.title)
                crawl_target_titles.append(clean_t)
        else:
            crawl_target_titles = None

        if run_cgv:
            from crawler.models import CGVScheduleLog
            cgv_logs = CGVScheduleLog.objects.filter(query_date__in=date_list).order_by('created_at')
            cnt = 0
            for log in cgv_logs:
                c, _ = MovieSchedule.create_from_cgv_log(log, target_titles=crawl_target_titles)
                cnt += c
            transform_results['CGV'] = cnt
            total_created += cnt

        if run_lotte:
            from crawler.models import LotteScheduleLog
            lotte_logs = LotteScheduleLog.objects.filter(query_date__in=date_list).order_by('created_at')
            cnt = 0
            for log in lotte_logs:
                c, _ = MovieSchedule.create_from_lotte_log(log, target_titles=crawl_target_titles)
                cnt += c
            transform_results['Lotte'] = cnt
            total_created += cnt

        if run_mega:
            from crawler.models import MegaboxScheduleLog
            mega_logs = MegaboxScheduleLog.objects.filter(query_date__in=date_list).order_by('created_at')
            cnt = 0
            for log in mega_logs:
                c, _ = MovieSchedule.create_from_megabox_log(log, target_titles=crawl_target_titles)
                cnt += c
            transform_results['Megabox'] = cnt
            total_created += cnt

        # 6. Export transformed schedules
        from crawler.utils.excel_exporter import export_transformed_schedules
        target_brands = []
        if run_cgv: target_brands.append('CGV')
        if run_lotte: target_brands.append('Lotte')
        if run_mega: target_brands.append('Megabox')

        schedule_qs = MovieSchedule.objects.filter(
            play_date__gte=start_date,
            play_date__lte=end_date,
            brand__in=target_brands
        )
        transform_excel = export_transformed_schedules(schedule_qs)

        history.status = 'SUCCESS'
        history.finished_at = timezone.now()
        history.result_summary = {
            "executed_companies": executed_companies,
            "target_dates": date_list,
            "target_movies": target_titles_list,
            "total_failures": len(all_failures),
            "failure_summary": [
                {
                    "brand": f.get('brand'),
                    "theater": f.get('theater'),
                    "date": f.get('date'),
                    "reason": f.get('reason')
                }
                for f in all_failures[:20]
            ],
            "transform_results": transform_results,
            "total_created": total_created,
        }
        history.excel_file_path = transform_excel or excel_path
        history.save()
    
    except InterruptedError:
        logger.warning(f"Background Task Stopped by User: {history_id}")
        history = CrawlerRunHistory.objects.get(id=history_id)
        # 이미 STOP_REQUESTED 일 것임
        history.status = 'STOPPED'
        history.finished_at = timezone.now()
        history.error_message = "Stopped by user request."
        history.save()
        
    except Exception as e:
        logger.error(f"Background Task Failed: {e}")
        history = CrawlerRunHistory.objects.get(id=history_id)
        history.status = 'FAILED'
        history.finished_at = timezone.now()
        history.error_message = str(e)
        history.save()


class CrawlerStopView(APIView):
    def post(self, request, history_id):
        try:
            history = CrawlerRunHistory.objects.get(id=history_id)
            if history.status in ['RUNNING', 'PENDING']:
                history.status = 'STOP_REQUESTED'
                history.save()
                return Response({"message": "Stop requested"}, status=status.HTTP_200_OK)
            else:
                return Response({"error": "Task is not running"}, status=status.HTTP_400_BAD_REQUEST)
        except CrawlerRunHistory.DoesNotExist:
            return Response({"error": "History not found"}, status=status.HTTP_404_NOT_FOUND)


class CrawlerExecutionView(APIView):
    """
    크롤러 수동 실행 API (Async via Threading)
    """
    def post(self, request):
        data = request.data
        
        # Basic Validation
        start_date_str = data.get('crawlStartDate')
        end_date_str = data.get('crawlEndDate')
        
        if not start_date_str or not end_date_str:
            return Response({"error": "crawlStartDate and crawlEndDate are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Create Pending History
            history = CrawlerRunHistory.objects.create(
                status='PENDING',
                configuration=data
            )
            
            # Start Background Thread
            thread = threading.Thread(target=run_crawler_background, args=(history.id, data))
            thread.daemon = True # Daemonize thread
            thread.start()
            
            return Response({
                "message": "Crawler started in background", 
                "history_id": history.id,
                "status": "PENDING"
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Crawler Execution Start Failed: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CrawlerHistoryView(APIView):
    """
    크롤러 실행 이력 조회 API
    """
    def get(self, request):
        # 최신순 20개 조회
        history_qs = CrawlerRunHistory.objects.all().order_by('-created_at')[:20]
        data = []
        for h in history_qs:
            data.append({
                "id": h.id,
                "created_at": h.created_at,
                "finished_at": h.finished_at,
                "status": h.status,
                "trigger_type": h.trigger_type,
                "configuration": h.configuration,
                "result_summary": h.result_summary,
                "error_message": h.error_message,
                "excel_file_path": h.excel_file_path
            })
        return Response(data, status=status.HTTP_200_OK)


class CrawlerDownloadView(APIView):
    """
    크롤러 결과 엑셀 다운로드 API
    """
    def get(self, request, history_id):
        try:
            history = CrawlerRunHistory.objects.get(id=history_id)
            if not history.excel_file_path or not os.path.exists(history.excel_file_path):
                return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)
                
            return FileResponse(open(history.excel_file_path, 'rb'), as_attachment=True)
            
        except CrawlerRunHistory.DoesNotExist:
            return Response({"error": "History not found"}, status=status.HTTP_404_NOT_FOUND)

def run_transform_background(new_history_id, source_history_id):
    """
    백그라운드 스케줄 변환 작업
    """
    try:
        new_history = CrawlerRunHistory.objects.get(id=new_history_id)
        source_history = CrawlerRunHistory.objects.get(id=source_history_id)
        
        new_history.status = 'RUNNING'
        new_history.save()
        
        data = source_history.configuration
        import json
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except:
                data = {}
        
        # 1. Parse Dates and Companies
        start_date_str = data.get('crawlStartDate')
        end_date_str = data.get('crawlEndDate')
        
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        
        date_list = []
        curr = start_date
        while curr <= end_date:
            date_list.append(curr.strftime("%Y%m%d"))
            curr += timedelta(days=1)
            
        choice_company = data.get('choiceCompany', {})
        if isinstance(choice_company, str):
            try:
                choice_company = json.loads(choice_company)
            except:
                choice_company = {}

        run_cgv = choice_company.get('cgv', False)
        run_lotte = choice_company.get('lotte', False)
        run_mega = choice_company.get('mega', False)
        
        processing_context = {"stage": "init", "log_id": None, "brand": None}
        
        results = {}
        total_created = 0
        
        # [Title Normalization Init]
        # [Title Normalization Init]
        from crawler.models import MovieSchedule
        from django.db.models import Min
        title_map = {}
        # Pre-populate title_map from existing DB to respect "First Come" titles
        map_start = start_date - timedelta(days=60)
        map_end = end_date + timedelta(days=60)
        
        # Optimize: Fetch distinct titles ordered by their first appearance (First-Come Rule)
        existing_titles_qs = MovieSchedule.objects.filter(
            start_time__date__gte=map_start, 
            start_time__date__lte=map_end
        ).values('movie_title').annotate(
            first_seen=Min('created_at')
        ).order_by('first_seen')
        
        for entry in existing_titles_qs:
            t = entry['movie_title']
            norm = MovieSchedule.normalize_title(t)
            if norm not in title_map:
                title_map[norm] = t

        # 2. CGV Transformation
        if run_cgv:
            from crawler.models import CGVScheduleLog
            log_ids = CGVScheduleLog.objects.filter(query_date__in=date_list).values_list('id', flat=True)
            if log_ids:
                cnt = 0
                errors = []
                logs = CGVScheduleLog.objects.filter(id__in=log_ids).order_by('created_at')
                for log in logs:
                    processing_context = {"stage": "CGV", "log_id": log.id, "theater": log.theater_name, "date": log.query_date}
                    c, e = MovieSchedule.create_from_cgv_log(log, title_map=title_map)
                    cnt += c
                    errors.extend(e)
                results['CGV'] = {"created": cnt, "errors": len(errors)}
                total_created += cnt
            else:
                results['CGV'] = {"created": 0, "message": "No logs found"}

        # 3. Lotte Transformation
        if run_lotte:
            from crawler.models import LotteScheduleLog
            log_ids = LotteScheduleLog.objects.filter(query_date__in=date_list).values_list('id', flat=True)
            if log_ids:
                cnt = 0
                errors = []
                logs = LotteScheduleLog.objects.filter(id__in=log_ids).order_by('created_at')
                for log in logs:
                    processing_context = {"stage": "Lotte", "log_id": log.id, "theater": log.theater_name, "date": log.query_date}
                    c, e = MovieSchedule.create_from_lotte_log(log, title_map=title_map)
                    cnt += c
                    errors.extend(e)
                results['Lotte'] = {"created": cnt, "errors": len(errors)}
                total_created += cnt
            else:
                results['Lotte'] = {"created": 0, "message": "No logs found"}

        # 4. Megabox Transformation
        if run_mega:
            from crawler.models import MegaboxScheduleLog
            log_ids = MegaboxScheduleLog.objects.filter(query_date__in=date_list).values_list('id', flat=True)
            if log_ids:
                cnt = 0
                errors = []
                logs = MegaboxScheduleLog.objects.filter(id__in=log_ids).order_by('created_at')
                for log in logs:
                    processing_context = {"stage": "Megabox", "log_id": log.id, "theater": log.theater_name, "date": log.query_date}
                    c, e = MovieSchedule.create_from_megabox_log(log, title_map=title_map)
                    cnt += c
                    errors.extend(e)
                results['Megabox'] = {"created": cnt, "errors": len(errors)}
                total_created += cnt
            else:
                results['Megabox'] = {"created": 0, "message": "No logs found"}
                
        # 5. Export to Excel
        from crawler.models import MovieSchedule
        from crawler.utils.excel_exporter import export_transformed_schedules
        
        target_brands = []
        if run_cgv: target_brands.append('CGV')
        if run_lotte: target_brands.append('Lotte')
        if run_mega: target_brands.append('Megabox')
        
        qs = MovieSchedule.objects.filter(
            play_date__gte=start_date,
            play_date__lte=end_date,
            brand__in=target_brands
        )
        
        file_path = export_transformed_schedules(qs)
        
        new_history.status = 'SUCCESS'
        new_history.finished_at = timezone.now()
        new_history.result_summary = {
            "source_history_id": source_history_id,
            "transform_stats": results,
            "total_created": total_created
        }
        new_history.excel_file_path = file_path
        new_history.save()
        
    except Exception as e:
        import traceback
        import json
        
        # Identify context
        context_str = "No specific context captured."
        try:
            if 'processing_context' in locals():
                context_str = json.dumps(processing_context, ensure_ascii=False, indent=2)
                
                # If we have a log_id, accept the effort to fetch and dump the raw json for debugging
                # This could be large, but it's essential for "str object has no attribute get" errors
                try:
                    target_log = None
                    pid = processing_context.get('log_id')
                    brand = processing_context.get('stage')
                    if pid and brand:
                        if brand == 'CGV':
                            from crawler.models import CGVScheduleLog
                            target_log = CGVScheduleLog.objects.filter(id=pid).first()
                        elif brand == 'Lotte':
                            from crawler.models import LotteScheduleLog
                            target_log = LotteScheduleLog.objects.filter(id=pid).first()
                        elif brand == 'Megabox':
                            from crawler.models import MegaboxScheduleLog
                            target_log = MegaboxScheduleLog.objects.filter(id=pid).first()
                            
                    if target_log:
                         # Append partial raw data
                         raw_dump = json.dumps(target_log.response_json, ensure_ascii=False)
                         if len(raw_dump) > 10000:
                             raw_dump = raw_dump[:10000] + "... (truncated)"
                         context_str += f"\n\n[Raw Log Data Request]\n{raw_dump}"
                except:
                    pass
        except:
            pass

        error_details = f"Background Transform Failed: {str(e)}\n\n"
        error_details += f"Traceback:\n{traceback.format_exc()}\n\n"
        error_details += f"Processing Context:\n{context_str}\n"

        logger.error(f"Background Transform Failed: {e}")
        
        # Create Error Log File
        from django.conf import settings
        import os
        
        new_history = CrawlerRunHistory.objects.get(id=new_history_id)
        new_history.status = 'FAILED'
        new_history.finished_at = timezone.now()
        new_history.error_message = str(e)
        
        try:
            file_name = f"error_log_{new_history_id}.txt"
            # Use MEDIA_ROOT if available, else 'media' in base
            base_dir = getattr(settings, 'MEDIA_ROOT', 'media')
            # Ensure it's absolute or relative to workspace
            if not os.path.isabs(base_dir):
                base_dir = os.path.join(settings.BASE_DIR, base_dir)
                
            if not os.path.exists(base_dir):
                os.makedirs(base_dir, exist_ok=True)
                
            error_file_path = os.path.join(base_dir, file_name)
            
            with open(error_file_path, "w", encoding="utf-8") as f:
                f.write(error_details)
                
            new_history.excel_file_path = error_file_path
        except Exception as file_e:
            new_history.error_message += f" (Failed to write log file: {file_e})"
            
        new_history.save()

class CrawlerTransformView(APIView):
    """
    [New] 크롤링된 로그 데이터를 실제 스케줄(MovieSchedule) 데이터로 변환 (Async)
    """
    def post(self, request, history_id):
        try:
            # Source History 존재 확인
            source_history = CrawlerRunHistory.objects.get(id=history_id)
            
            # Create New History for this Task
            new_history = CrawlerRunHistory.objects.create(
                status='PENDING',
                trigger_type='TRANSFORM',
                configuration={
                    "source_history_id": history_id,
                    "original_config": source_history.configuration
                }
            )
            
            # Start Thread
            thread = threading.Thread(target=run_transform_background, args=(new_history.id, history_id))
            thread.daemon = True
            thread.start()
            
            return Response({
                "message": "Transformation started in background",
                "history_id": new_history.id,
                "status": "PENDING"
            }, status=status.HTTP_200_OK)
            
        except CrawlerRunHistory.DoesNotExist:
            return Response({"error": "Source history not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Transform Start Error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CrawlerScheduleOptionsView(APIView):
    """
    특정 날짜의 스케줄이 있는 영화 목록 조회 API
    Param: date (YYYYMMDD)
    """
    def get(self, request):
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({"error": "Date parameter is required"}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            target_date = datetime.strptime(date_str, "%Y%m%d").date()
            
            from crawler.models import MovieSchedule
            movies = MovieSchedule.objects.filter(
                play_date=target_date
            ).values_list('movie_title', flat=True).distinct().order_by('movie_title')
            
            return Response({"movies": list(movies)}, status=status.HTTP_200_OK)
            
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYYMMDD"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Schedule Options Error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CrawlerScheduleListView(APIView):
    """
    MovieSchedule 조회 API (크롤링 결과 확인용)
    Params: brand, start_date, end_date, theater_name, movie_title, page, page_size
    """
    def get(self, request):
        from crawler.models import MovieSchedule, CGVScheduleLog, LotteScheduleLog, MegaboxScheduleLog
        from django.db.models import Count

        brand = request.query_params.get('brand', '').strip()
        start_date_str = request.query_params.get('start_date', '').strip()
        end_date_str = request.query_params.get('end_date', '').strip()
        theater_name = request.query_params.get('theater_name', '').strip()
        movie_title = request.query_params.get('movie_title', '').strip()
        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(200, max(1, int(request.query_params.get('page_size', 50))))
        except (ValueError, TypeError):
            page, page_size = 1, 50

        qs = MovieSchedule.objects.all()

        if brand:
            qs = qs.filter(brand=brand)

        start_date, end_date = None, None
        if start_date_str:
            try:
                start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
                qs = qs.filter(play_date__gte=start_date)
            except ValueError:
                pass
        if end_date_str:
            try:
                end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
                qs = qs.filter(play_date__lte=end_date)
            except ValueError:
                pass

        if theater_name:
            qs = qs.filter(theater_name__icontains=theater_name)
        if movie_title:
            qs = qs.filter(movie_title__icontains=movie_title)

        qs = qs.order_by('play_date', 'brand', 'theater_name', 'start_time')

        total = qs.count()
        brand_stats = {item['brand']: item['cnt'] for item in qs.values('brand').annotate(cnt=Count('id'))}
        theater_count = qs.values('theater_name').distinct().count()
        movie_count = qs.values('movie_title').distinct().count()

        # Raw log counts (크롤링 수집 건수 - transform 전 원본)
        log_filter = {}
        if start_date:
            log_filter['query_date__gte'] = start_date.strftime("%Y%m%d")
        if end_date:
            log_filter['query_date__lte'] = end_date.strftime("%Y%m%d")

        raw_logs = {
            "CGV": CGVScheduleLog.objects.filter(**log_filter).count() if (not brand or brand == 'CGV') else None,
            "LOTTE": LotteScheduleLog.objects.filter(**log_filter).count() if (not brand or brand == 'LOTTE') else None,
            "MEGABOX": MegaboxScheduleLog.objects.filter(**log_filter).count() if (not brand or brand == 'MEGABOX') else None,
        }

        offset = (page - 1) * page_size
        page_qs = qs[offset:offset + page_size]

        results = []
        for s in page_qs:
            results.append({
                "id": s.id,
                "brand": s.brand,
                "theater_name": s.theater_name,
                "movie_title": s.movie_title,
                "screen_name": s.screen_name,
                "start_time": s.start_time.strftime("%Y-%m-%d %H:%M") if s.start_time else None,
                "end_time": s.end_time.strftime("%H:%M") if s.end_time else None,
                "play_date": s.play_date.strftime("%Y-%m-%d") if s.play_date else None,
                "remaining_seats": s.remaining_seats,
                "total_seats": s.total_seats,
                "tags": s.tags or [],
                "is_booking_available": s.is_booking_available,
            })

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "results": results,
            "stats": {
                "theater_count": theater_count,
                "movie_count": movie_count,
                "by_brand": brand_stats,
                "raw_logs": raw_logs,
            }
        }, status=status.HTTP_200_OK)


class CrawlerScheduleExportView(APIView):
    """
    특정 날짜(기간)와 영화의 스케줄 엑셀 다운로드 API
    Body: start_date (YYYYMMDD), end_date (YYYYMMDD optional), movie_title
    Fallback: date -> start_date
    """
    def post(self, request):
        start_date_str = request.data.get('start_date') or request.data.get('date')
        end_date_str = request.data.get('end_date') or start_date_str
        movie_title = request.data.get('movie_title')
        
        if not start_date_str or not movie_title:
            return Response({"error": "start_date/date and movie_title are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Support both YYYYMMDD and YYYY-MM-DD formats
            def parse_date(s):
                s = s.strip()
                if '-' in s:
                    return datetime.strptime(s, "%Y-%m-%d").date()
                return datetime.strptime(s, "%Y%m%d").date()

            start_date = parse_date(start_date_str)
            end_date = parse_date(end_date_str)
            
            from crawler.models import MovieSchedule
            from crawler.utils.excel_exporter import export_transformed_schedules
            
            # qs is the initial candidate list based on date
            qs = MovieSchedule.objects.filter(
                play_date__gte=start_date,
                play_date__lte=end_date
            )

            # --- Flexible Title Filtering ---
            import re
            def normalize_string(s):
                return re.sub(r'[^a-zA-Z0-9가-힣]', '', s)

            def filter_by_title(base_qs, title):
                clean_target = normalize_string(title)
                matched_ids = []
                for schedule in base_qs:
                    clean_db_title = normalize_string(schedule.movie_title)
                    if clean_target in clean_db_title:
                        matched_ids.append(schedule.id)
                return base_qs.filter(id__in=matched_ids)

            main_qs = filter_by_title(qs, movie_title) if movie_title else qs

            # --- Competitor Data ---
            from crawler.models import CrawlTargetMovie
            competitor_titles = list(
                CrawlTargetMovie.objects.filter(movie_type='competitor', is_active=True)
                .values_list('title', flat=True)
            )

            competitor_querysets = {}
            for comp_title in competitor_titles:
                clean_title, _ = MovieSchedule.parse_and_normalize_title(comp_title)
                comp_qs = filter_by_title(qs, clean_title)
                if comp_qs.exists():
                    competitor_querysets[comp_title] = comp_qs

            # Pass metadata for filename generation
            file_path = export_transformed_schedules(
                main_qs,
                movie_title=movie_title,
                start_date=start_date,
                end_date=end_date,
                competitor_querysets=competitor_querysets
            )
            
            if not file_path:
                return Response({"error": "No schedules found for this criteria"}, status=status.HTTP_404_NOT_FOUND)
                
            return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=os.path.basename(file_path))
            
        except ValueError:
            return Response({"error": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Schedule Export Error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _serialize_target(t):
    clean_title, _ = MovieSchedule.parse_and_normalize_title(t.title)
    return {
        "id": t.id,
        "title": t.title,
        "clean_title": clean_title,
        "movie_type": t.movie_type,
        "is_active": t.is_active,
        "created_at": t.created_at.strftime("%Y-%m-%d %H:%M"),
    }


class CrawlTargetMovieView(APIView):
    """
    크롤 대상 영화 목록 관리
    GET    /Api/crawler/targets/  - 전체 목록
    POST   /Api/crawler/targets/  - 추가
    """

    def get(self, request):
        targets = CrawlTargetMovie.objects.all()
        return Response([_serialize_target(t) for t in targets])

    def post(self, request):
        title = (request.data.get("title") or "").strip()
        if not title:
            return Response({"error": "title 필드가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)

        movie_type = request.data.get("movie_type", "main")
        if movie_type not in ('main', 'competitor'):
            movie_type = 'main'

        obj = CrawlTargetMovie.objects.create(
            title=title, movie_type=movie_type,
        )
        return Response(_serialize_target(obj), status=status.HTTP_201_CREATED)


class CrawlTargetMovieDetailView(APIView):

    def patch(self, request, pk):
        try:
            obj = CrawlTargetMovie.objects.get(pk=pk)
        except CrawlTargetMovie.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        obj.is_active = not obj.is_active
        obj.save()
        return Response({"id": obj.id, "is_active": obj.is_active})

    def delete(self, request, pk):
        try:
            obj = CrawlTargetMovie.objects.get(pk=pk)
        except CrawlTargetMovie.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
