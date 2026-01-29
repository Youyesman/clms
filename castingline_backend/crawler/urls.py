from django.urls import path
from .views import CrawlerExecutionView, CrawlerHistoryView, CrawlerDownloadView, CrawlerStopView

urlpatterns = [
    path('run/', CrawlerExecutionView.as_view(), name='crawler_run'),
    path('stop/<int:history_id>/', CrawlerStopView.as_view(), name='crawler_stop'),
    path('history/', CrawlerHistoryView.as_view(), name='crawler_history'),
    path('download/<int:history_id>/', CrawlerDownloadView.as_view(), name='crawler_download'),
]
