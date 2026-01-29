from rest_framework.decorators import api_view
from movie.models import Movie
from rest_framework.response import Response
from movie.models import *
from movie.serializers import *
from rest_framework import viewsets, permissions
from rest_framework.pagination import PageNumberPagination
from rest_framework import filters
from rest_framework.permissions import AllowAny
from django.db.models import F
from castingline_backend.utils.ordering import KoreanOrderingFilter
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from crawler.management.commands.run_cgv_pipeline import fetch_cgv_schedule_rpa

class DefaultPagination(PageNumberPagination):
    page_size = 20  # 한 페이지에 보여질 항목 수 설정
    page_size_query_param = "page_size"
    max_page_size = 100  # 최대 몇개 항목까지 보여줄건지?


class MovieViewSet(viewsets.ModelViewSet):
    queryset = Movie.objects.all().order_by("-created_date")
    serializer_class = MovieSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, KoreanOrderingFilter]
    filterset_fields = {
        "distributor": ["exact"],
        "movie_code": ["exact"],
        "is_primary_movie": ["exact"],
        "created_date": ["date", "exact"],
    }

    search_fields = ["title_ko"]
    ordering_fields = "__all__"

    def perform_create(self, serializer):
        # 1. 현재 연도 가져오기 (2026)
        current_year = timezone.now().year
        prefix = f"C{current_year}"

        # 2. 해당 연도로 시작하는 가장 마지막 movie_code 조회
        # movie_code가 'C20260001' 형태라고 가정할 때, 가장 큰 번호를 찾습니다.
        last_movie = (
            Movie.objects.filter(movie_code__startswith=prefix)
            .order_by("movie_code")
            .last()
        )

        if last_movie:
            # 마지막 번호에서 숫자 부분만 추출 (예: 'C20260005' -> 5)
            try:
                last_number = int(last_movie.movie_code[5:])
                new_number = last_number + 1
            except (ValueError, IndexError):
                new_number = 1
        else:
            # 해당 연도에 첫 영화인 경우
            new_number = 1

        # 3. 새로운 movie_code 생성 (4자리 패딩 예: 0001)
        # 만약 영화 숫자가 연간 1만 개가 넘는다면 :05d 등으로 조절하세요.
        new_movie_code = f"{prefix}{new_number:03d}"

        # 4. serializer에 movie_code를 주입하여 저장
        serializer.save(movie_code=new_movie_code)


@api_view(["GET"])
def get_public_movies(request):
    """
    공개된(is_public=True) 영화 목록을 가져오는 API
    연도(release_year) 파라미터가 있으면 해당 연도 영화만 필터링
    """
    release_year = request.query_params.get("release_year")

    # 1. 기본 필터: 공개된 영화 + 대표 영화 위주
    # (모든 버전을 다 보여주려면 is_primary_movie 필터는 제거하세요)
    qs = Movie.objects.filter(is_public=True)

    # 2. 연도 필터링 (개봉일 기준)
    if release_year:
        qs = qs.filter(release_date__year=release_year)

    # 3. 정렬 (최신순 또는 가나다순)
    qs = qs.order_by("-release_date", "title_ko")

    # 4. 데이터 구성
    data = [
        {
            "id": movie.id,
            "title_ko": movie.title_ko,
            "movie_code": movie.movie_code,
            "release_date": movie.release_date,
        }
        for movie in qs
    ]

    return Response(data)

@api_view(["GET", "POST"])
def fetch_cgv_schedule_view(request):
    """
    CGV 스케줄 API를 호출하고 결과를 DB에 저장합니다.
    파라미터:
    - coCd: 회사 코드 (기본: A420)
    - siteNo: 지점 번호 (기본: 0054)
    - scnYmd: 상영 일자 YYYYMMDD (기본: 20260127)
    """
    co_cd = request.GET.get("coCd") or request.data.get("coCd", "A420")
    site_no = request.GET.get("siteNo") or request.data.get("siteNo", "0054")
    scn_ymd = request.GET.get("scnYmd") or request.data.get("scnYmd", "20260127")

    try:
        # RPA 함수 내부에서 DB 저장까지 수행됨
        data = fetch_cgv_schedule_rpa(co_cd, site_no, scn_ymd)
        
        status = "success" if isinstance(data, dict) and "error" not in data else "fail"

        return Response({
            "message": "Fetch and Save completed (Internal)",
            "status": status,
            "data": data
        })

    except Exception as e:
        return Response({"error": str(e)}, status=500)
