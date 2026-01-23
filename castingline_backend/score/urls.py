from django.urls import path, include
from .views import *
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register("scores", ScoreViewSet)


urlpatterns = [
    path("", include(router.urls)),
    path("score/summary/", score_summary),
    path('score/preview_upload/', preview_score_upload,
         name='score-preview-upload'),

    # ✅ 2. 최종 확정 저장 API (객체 리스트를 받아 DB 저장)
    path('score/confirm_save/', confirm_score_save,
         name='score-confirm-save'),
]
