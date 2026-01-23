"""
URL configuration for castingline_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("Api/", include("accounts.urls")),
    path("Api/", include("client.urls")),
    path("Api/", include("movie.urls")),
    path("Api/", include("order.urls")),
    path("Api/", include("rate.urls")),
    path("Api/", include("score.urls")),
    path("Api/", include("fund.urls")),
    path("Api/", include("settlement.urls")),
]
