from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter

urlpatterns = [
    # 프론트엔드에서 AxiosGet("settlements/...")으로 호출하는 경로
    path("settlements/", SettlementListView.as_view(), name="settlement-list"),
    path(
        "settlement-movies/", SettlementMovieListView.as_view(), name="settlement-list"
    ),
    path('special-settlement/', SpecialSettlementListView.as_view(),
         name='special-settlement-list'),
    path('special-settlement/excel/', SpecialSettlementExcelView.as_view(),
         name='special-settlement-excel'),
    path('settlement-excel-export/',
         SettlementExcelExportView.as_view(), name='settlement-excel'),
    path('settlement-esero-export/',
         SettlementEseroExportView.as_view(), name='settlement-esero'),
    path('settlement-compare/',
         SettlementCompareView.as_view(), name='settlement-compare'),
    path('settlement-adjustments/',
         SettlementAdjustmentView.as_view(), name='settlement-adjustments'),
    path('settlement-adjustments/<int:pk>/',
         SettlementAdjustmentDetailView.as_view(), name='settlement-adjustment-detail'),
    path('settlement-adjustments/<int:pk>/<str:scope>/',
         SettlementAdjustmentDetailView.as_view(), name='settlement-adjustment-partial'),
    path('settlement-confirms/',
         SettlementConfirmView.as_view(), name='settlement-confirms'),
]
