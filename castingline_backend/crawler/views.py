from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import FileResponse, Http404
from django.utils import timezone
from datetime import datetime, timedelta
import logging
import threading
import os

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
        
        executed_companies = []
        companies_for_export = []
        
        # Stop Signal Helper
        def check_stop_signal():
            h = CrawlerRunHistory.objects.get(id=history_id)
            if h.status == 'STOP_REQUESTED':
                raise InterruptedError("User requested stop")
            return False

        # Execute Pipelines
        if run_cgv:
            check_stop_signal()
            print(f"Executing CGV for {date_list}")
            try:
                logs, cnt, failures = CGVPipelineService.collect_schedule_logs(dates=date_list, stop_signal=check_stop_signal)
                check_stop_signal()
                
                # [USER REQUEST] Slack Report & Disable Transform
                CGVPipelineService.send_slack_message("SUCCESS", {
                    "collected": len(logs),
                    "created": 0,
                    "failures": failures
                })
                
                # log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
                # CGVPipelineService.transform_logs_to_schedule(log_ids, target_titles=target_titles_list)
                
                executed_companies.append('CGV')
                companies_for_export.append('CGV')
            except InterruptedError:
                raise
            except Exception as e:
                CGVPipelineService.send_slack_message("ERROR", {"errors": [{"theater": "Global", "movie": "Unknown", "error": str(e)}]})
                logger.error(f"CGV Failure: {e}") 

        if run_lotte:
            check_stop_signal()
            print(f"Executing Lotte for {date_list}")
            try:
                logs, cnt, failures = LottePipelineService.collect_schedule_logs(dates=date_list, stop_signal=check_stop_signal)
                check_stop_signal()
                
                # [USER REQUEST] Slack Report & Disable Transform
                LottePipelineService.send_slack_message("SUCCESS", {
                    "collected": len(logs),
                    "created": 0,
                    "failures": failures
                })

                # log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
                # LottePipelineService.transform_logs_to_schedule(log_ids, target_titles=target_titles_list)
                
                executed_companies.append('Lotte')
                companies_for_export.append('LOTTE') # Map to DB value
            except InterruptedError:
                raise
            except Exception as e:
                LottePipelineService.send_slack_message("ERROR", {"errors": [{"theater": "Global", "movie": "Unknown", "error": str(e)}]})
                logger.error(f"Lotte Failure: {e}")

        if run_mega:
            check_stop_signal()
            print(f"Executing Megabox for {date_list}")
            try:
                logs, cnt, failures = MegaboxPipelineService.collect_schedule_logs(dates=date_list, stop_signal=check_stop_signal)
                check_stop_signal()
                
                # [USER REQUEST] Slack Report & Disable Transform
                MegaboxPipelineService.send_slack_message("SUCCESS", {
                    "collected": len(logs),
                    "created": 0,
                    "failures": failures
                })

                # log_ids = [l['log_id'] for l in logs if isinstance(l, dict) and 'log_id' in l]
                # MegaboxPipelineService.transform_logs_to_schedule(log_ids, target_titles=target_titles_list)
                
                executed_companies.append('Megabox')
                companies_for_export.append('MEGABOX')
            except InterruptedError:
                raise
            except Exception as e:
                MegaboxPipelineService.send_slack_message("ERROR", {"errors": [{"theater": "Global", "movie": "Unknown", "error": str(e)}]})
                logger.error(f"Megabox Failure: {e}")
                
        # 4. Generate Excel
        check_stop_signal()
        excel_path = export_schedules_to_excel(
            start_date_str=start_date_str,
            end_date_str=end_date_str,
            companies=companies_for_export,
            target_titles=target_titles_list
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
