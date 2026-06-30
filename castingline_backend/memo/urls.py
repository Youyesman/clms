from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/memo/", views.shared_memo, name="dashboard-shared-memo"),
]
