from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register("rates", RateViewSet)
router.register("default-rates", DefaultRateViewSet, basename="default-rates")
router.register("theater-rates", TheaterRateViewSet)
router.register("order-rate-status", OrderViewSet,
                basename="order-rate-status")

urlpatterns = [
    path("", include(router.urls)),
    path('rate-excel-export/', RateExcelExportView.as_view(), name='rate-excel'),
]
