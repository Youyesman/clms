from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter


router = DefaultRouter()
router.register("clients", ClientViewSet)
router.register("theaters", TheaterViewSet)
router.register("fares", FareViewSet)
router.register("theater-maps", TheaterMapViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("find_similar_client/", FindSimilarClient.as_view()),
    path(
        "theater-map-distributors/",
        TheaterMapDistributorListView.as_view(),
        name="theater-map-distributors",
    ),
    path('client-excel-export/',
         ClientExcelExportView.as_view(), name='client-excel'),
    path('theaters-excel-export/',
         TheaterExcelExportView.as_view(), name='theater-excel'),
    path('theater-maps-excel-export/',
         TheaterMapExcelExportView.as_view(), name='theater-map-excel'),
]
