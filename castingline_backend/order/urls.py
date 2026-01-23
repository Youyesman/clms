from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter


router = DefaultRouter()
router.register("order", OrderViewSet)
router.register("orderlist", OrderListViewSet)

urlpatterns = [
    path("order-excel-export/", OrderExcelExportView.as_view(), name="order-excel-export"),
    path("", include(router.urls)),
]
