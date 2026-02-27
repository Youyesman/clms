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

    # 7. 일현황 API
    path('score/daily/', score_daily_status,
         name='score-daily-status'),

    # 8. 좌석판매율 현황 API
    path('score/seat-rate/', score_seat_rate,
         name='score-seat-rate'),

    # 9. 누계 순위 API
    path('score/ranking/', score_ranking,
         name='score-ranking'),

    # 10. 집계작 시간표 날짜 목록 API
    path('score/timetable/dates/', score_timetable_dates,
         name='score-timetable-dates'),

    # 11. 집계작 시간표 집계 API
    path('score/timetable/', score_timetable,
         name='score-timetable'),

    # 12. 상세 부금 조회 API (배급사용)
    path('score/settlement/', score_settlement_detail,
         name='score-settlement-detail'),

    # 13. 영화명 검색 API (자동완성)
    path('score/movies-search/', score_movies_search,
         name='score-movies-search'),

    # 14. 주요작 영화 목록 API
    path('score/competitor/movies/', score_competitor_movies,
         name='score-competitor-movies'),

    # 15. 주요작 좌석수 집계 API
    path('score/competitor/seats/', score_competitor_seats,
         name='score-competitor-seats'),
]
