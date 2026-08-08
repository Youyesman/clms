from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/memo/", views.shared_memo, name="dashboard-shared-memo"),
    path("dashboard/calendar/", views.calendar_events, name="dashboard-calendar"),
    path("dashboard/calendar/<int:pk>/", views.calendar_event_detail,
         name="dashboard-calendar-detail"),
]
