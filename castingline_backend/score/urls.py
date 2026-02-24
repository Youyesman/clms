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

    # 2. 최종 확정 저장 API (객체 리스트를 받아 DB 저장)
    path('score/confirm_save/', confirm_score_save,
         name='score-confirm-save'),

    # 3. 배급사별 연도별 영화 목록 API
    path('score/movies-by-year/', movies_by_year,
         name='score-movies-by-year'),

    # 4. 대표 영화의 서브(포맷) 목록 API
    path('score/movie-formats/', movie_formats,
         name='score-movie-formats'),

    # 5. 엑셀 다운로드 API
    path('score/summary/excel/', score_summary_excel,
         name='score-summary-excel'),

    # 6. 기준별 현황 API
    path('score/criteria/', score_criteria,
         name='score-criteria'),
]
