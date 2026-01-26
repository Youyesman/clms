from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter


router = DefaultRouter()
router.register("movies", MovieViewSet, basename="movie")


urlpatterns = [
    path("", include(router.urls)),
    path('public_movies/', get_public_movies, name='public_movies'),
    path('cgv/fetch/', fetch_cgv_schedule_view, name='fetch_cgv_schedule'),
]
