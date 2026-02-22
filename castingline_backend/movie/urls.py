from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter


router = DefaultRouter()
router.register("movies", MovieViewSet, basename="movie")


urlpatterns = [
    path("", include(router.urls)),
    path('public_movies/', get_public_movies, name='public_movies'),
    path('cgv/fetch/', fetch_cgv_schedule_view, name='fetch_cgv_schedule'),
    # TMDB proxy
    path('tmdb/trending/', tmdb_trending, name='tmdb_trending'),
    path('tmdb/upcoming/', tmdb_upcoming, name='tmdb_upcoming'),
    path('tmdb/now_playing/', tmdb_now_playing, name='tmdb_now_playing'),
    path('news/movies/', movie_news, name='movie_news'),
]
