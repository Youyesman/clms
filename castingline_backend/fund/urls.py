from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FundViewSet, MonthlyFundViewSet, DailyFundViewSet, FundExcelExportView, MonthlyFundExcelExportView, DailyFundExcelExportView

router = DefaultRouter()
router.register('funds', FundViewSet, basename='fund')
router.register('monthly-funds', MonthlyFundViewSet, basename='monthly-fund')
router.register('daily-funds', DailyFundViewSet, basename='daily-fund')
urlpatterns = [
    path('fund-excel-export/', FundExcelExportView.as_view(), name='fund-excel-export'),
    path('monthly-fund-excel-export/', MonthlyFundExcelExportView.as_view(), name='monthly-fund-excel-export'),
    path('daily-fund-excel-export/', DailyFundExcelExportView.as_view(), name='daily-fund-excel-export'),
    path('', include(router.urls)),
]
