from django.urls import path

from . import views

urlpatterns = [
    path("forecast/movies/", views.forecast_movies, name="forecast-movies"),
    path("forecast/report/", views.forecast_report, name="forecast-report"),
    path("forecast/report/pdf/", views.forecast_report_pdf, name="forecast-report-pdf"),
]
