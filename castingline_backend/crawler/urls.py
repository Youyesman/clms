from django.urls import path
from .views import CrawlerExecutionView, CrawlerHistoryView, CrawlerDownloadView, CrawlerStopView, CrawlerTransformView, CrawlerScheduleOptionsView, CrawlerScheduleExportView

urlpatterns = [
    path('run/', CrawlerExecutionView.as_view(), name='crawler_run'),
    path('stop/<int:history_id>/', CrawlerStopView.as_view(), name='crawler_stop'),
    path('transform/<int:history_id>/', CrawlerTransformView.as_view(), name='crawler_transform'),
    path('history/', CrawlerHistoryView.as_view(), name='crawler_history'),
    path('download/<int:history_id>/', CrawlerDownloadView.as_view(), name='crawler_download'),
    path('schedules/options/', CrawlerScheduleOptionsView.as_view(), name='schedule_options'),
    path('schedules/export/', CrawlerScheduleExportView.as_view(), name='schedule_export'),
]
