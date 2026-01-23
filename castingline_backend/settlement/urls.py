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
]
