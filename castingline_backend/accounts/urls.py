from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter
from django.contrib.auth import views as auth_views

router = DefaultRouter()
router.register("getuser", GetUser, basename="getuser")
router.register("users", UserViewSet, basename="user")


urlpatterns = [
    path("", include(router.urls)),
    path("checktoken/", TokenCheck.as_view(), name="login"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("userprofile/", UserProfile.as_view()),
    path("userprofile/<int:pk>/", UserProfile.as_view()),
    path("create_user/", UserCreateView.as_view()),
    path("password_change/", ChangePasswordView.as_view()),
    path("groups/", GroupListView.as_view()),
]
