
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
