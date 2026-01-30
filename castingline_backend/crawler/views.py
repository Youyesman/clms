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
from crawler.models import CrawlerRunHistory
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
                
        # 4. Generate Excel
        check_stop_signal()
        excel_path = export_schedules_to_excel(
            start_date_str=start_date_str,
            end_date_str=end_date_str,
            companies=companies_for_export,
            target_titles=target_titles_list,
            failures=all_failures
        )
        
        history.status = 'SUCCESS'
        history.finished_at = timezone.now()
        history.result_summary = {
            "executed_companies": executed_companies,
            "target_dates": date_list,
            "target_movies": target_titles_list
        }
        history.excel_file_path = excel_path
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
        run_cgv = choice_company.get('cgv', False)
        run_lotte = choice_company.get('lotte', False)
        run_mega = choice_company.get('mega', False)
        
        results = {}
        total_created = 0
        
        # 2. CGV Transformation
        if run_cgv:
            from crawler.models import CGVScheduleLog
            log_ids = CGVScheduleLog.objects.filter(query_date__in=date_list).values_list('id', flat=True)
            if log_ids:
                cnt, errors = CGVPipelineService.transform_logs_to_schedule(log_ids=list(log_ids))
                results['CGV'] = {"created": cnt, "errors": len(errors)}
                total_created += cnt
            else:
                results['CGV'] = {"created": 0, "message": "No logs found"}

        # 3. Lotte Transformation
        if run_lotte:
            from crawler.models import LotteScheduleLog
            # [FIX] query_date for Lotte
            log_ids = LotteScheduleLog.objects.filter(query_date__in=date_list).values_list('id', flat=True)
            if log_ids:
                cnt, errors = LottePipelineService.transform_logs_to_schedule(log_ids=list(log_ids))
                results['Lotte'] = {"created": cnt, "errors": len(errors)}
                total_created += cnt
            else:
                results['Lotte'] = {"created": 0, "message": "No logs found"}

        # 4. Megabox Transformation
        if run_mega:
            from crawler.models import MegaboxScheduleLog
            # [FIX] query_date for Megabox
            log_ids = MegaboxScheduleLog.objects.filter(query_date__in=date_list).values_list('id', flat=True)
            if log_ids:
                cnt, errors = MegaboxPipelineService.transform_logs_to_schedule(log_ids=list(log_ids))
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
            start_time__date__gte=start_date,
            start_time__date__lte=end_date,
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
        logger.error(f"Background Transform Failed: {e}")
        new_history = CrawlerRunHistory.objects.get(id=new_history_id)
        new_history.status = 'FAILED'
        new_history.finished_at = timezone.now()
        new_history.error_message = str(e)
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
                start_time__date=target_date
            ).values_list('movie_title', flat=True).distinct().order_by('movie_title')
            
            return Response({"movies": list(movies)}, status=status.HTTP_200_OK)
            
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYYMMDD"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Schedule Options Error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CrawlerScheduleExportView(APIView):
    """
    특정 날짜와 영화의 스케줄 엑셀 다운로드 API
    Body: date (YYYYMMDD), movie_title
    """
    def post(self, request):
        date_str = request.data.get('date')
        movie_title = request.data.get('movie_title')
        
        if not date_str or not movie_title:
            return Response({"error": "date and movie_title are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            target_date = datetime.strptime(date_str, "%Y%m%d").date()
            
            from crawler.models import MovieSchedule
            from crawler.utils.excel_exporter import export_transformed_schedules
            
            qs = MovieSchedule.objects.filter(
                start_time__date=target_date,
                movie_title=movie_title
            )
            
            file_path = export_transformed_schedules(qs)
            
            if not file_path:
                return Response({"error": "No schedules found for this criteria"}, status=status.HTTP_404_NOT_FOUND)
                
            return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=os.path.basename(file_path))
            
        except ValueError:
            return Response({"error": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Schedule Export Error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
