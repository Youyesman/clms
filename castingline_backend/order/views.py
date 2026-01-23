from .models import *
from .serializers import *
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from django.db.models import F
from datetime import datetime
from castingline_backend.utils.ordering import KoreanOrderingFilter
from rest_framework import viewsets, filters, status
from rest_framework.response import Response
from score.models import Score
from rest_framework.views import APIView
from castingline_backend.utils.excel_helper import ExcelGenerator


class DefaultPagination(PageNumberPagination):
    page_size = 20  # 한 페이지에 보여질 항목 수 설정
    page_size_query_param = "page_size"
    max_page_size = 100  # 최대 몇개 항목까지 보여줄건지?


class OrderViewSet(viewsets.ModelViewSet):
    # ✅ select_related를 추가하여 극장(client)과 영화(movie) 정보를 미리 조인합니다 (성능 최적화).
    queryset = Order.objects.all().select_related("client", "movie").order_by("-id")
    serializer_class = OrderSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination
    filter_backends = [filters.SearchFilter, KoreanOrderingFilter]
    search_fields = ["client__client_name", "movie__title_ko"]  # 검색 기능 보강
    ordering_fields = "__all__"

    def get_queryset(self):
        # 1. 기본 쿼리셋 가져오기
        queryset = super().get_queryset()

        # 2. URL 파라미터들 가져오기
        ol_id = self.request.query_params.get("id")  # OrderList ID
        filter_start_date = self.request.query_params.get("start_date")  # 기준일자
        filter_client_id = self.request.query_params.get("client_id")  # 극장 ID

        # 3. 기존 로직: OrderList ID가 있으면 해당 영화의 오더들만 1차 필터링
        if ol_id:
            try:
                base_order = OrderList.objects.get(id=ol_id)
                queryset = queryset.filter(movie=base_order.movie)
            except OrderList.DoesNotExist:
                return queryset.none()

        # 4. ✅ 추가 로직: 기준일자 필터링 (start_date)
        if filter_start_date:
            queryset = queryset.filter(release_date__gte=filter_start_date)

        # 5. ✅ 추가 로직: 특정 극장 필터링 (client_id)
        if filter_client_id:
            queryset = queryset.filter(client_id=filter_client_id)

        return queryset

    def destroy(self, request, *args, **kwargs):
        # 1. 삭제하려는 대상(Order) 객체 가져오기
        instance = self.get_object()

        # 2. 관련 스코어 데이터 조회
        scores = Score.objects.filter(
            client=instance.client, movie=instance.movie)
        score_count = scores.count()

        if score_count > 0:
            # 조건: 딱 1건만 있고, 그 데이터의 visitor가 null인지 확인
            if score_count == 1:
                score_obj = scores.first()
                if score_obj.visitor is None:
                    # [조건 만족] 스코어 삭제 후 Order 삭제 진행
                    score_obj.delete()
                else:
                    # visitor 데이터가 있는 경우 삭제 불가
                    return Response(
                        {
                            "detail": "등록된 관객수(visitor) 데이터가 있어 삭제할 수 없습니다."
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                # 스코어 데이터가 2건 이상인 경우 (안전상 삭제 차단)
                return Response(
                    {
                        "detail": "복수의 스코어 데이터가 존재하여 삭제할 수 없습니다. 스코어를 먼저 확인해 주세요."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # 3. 최종적으로 Order 객체 삭제 (스코어가 없었거나, 위에서 조건 만족 시 삭제됨)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_destroy(self, instance):
        instance.delete()

    def create(self, request, *args, **kwargs):
        # 기존에 작성하신 create 로직 유지
        data = request.data.copy()

        # [기존 로직] 영화(Movie) 외래키 처리
        movie_id = data.get("movie")
        if movie_id:
            if isinstance(movie_id, dict):
                movie_id = movie_id.get("id")
            if not Movie.objects.filter(id=movie_id).exists():
                return Response(
                    {"movie": ["유효하지 않은 영화 ID입니다."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data["movie"] = movie_id

        # [기존 로직] 극장(Client) 외래키 처리
        client_id = data.get("client")
        if client_id:
            if isinstance(client_id, dict):
                client_id = client_id.get("id")
            if not Client.objects.filter(id=client_id).exists():
                return Response(
                    {"client": ["유효하지 않은 극장 ID입니다."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data["client"] = client_id

        # 시리얼라이저를 통한 저장 (여기서 내부적으로 perform_create가 호출됨)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )


class OrderListViewSet(viewsets.ModelViewSet):
    # ✅ select_related를 사용하여 Movie, 배급사, 제작사 정보를 한 번에 조인(Join)해서 가져옵니다.
    queryset = OrderList.objects.all().select_related(
        "movie", "movie__distributor", "movie__production_company"
    )
    serializer_class = OrderListSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination
    filter_backends = [filters.SearchFilter, KoreanOrderingFilter]
    search_fields = ["movie__title_ko", "movie__movie_code"]  # 기본 검색 기능 보강
    ordering_fields = "__all__"

    def get_queryset(self):
        queryset = super().get_queryset()

        # 1. 개봉년도 이상 필터 (?year_after=2024)
        year_after = self.request.query_params.get("year_after")
        if year_after and year_after.isdigit():
            # 영화의 개봉일(release_date)의 연도가 입력값보다 크거나 같은 것만 필터링
            queryset = queryset.filter(
                movie__release_date__year__gte=year_after)

        # 2. 특정 영화 필터 (?movie_id=123)
        # 프론트엔드 AutocompleteMovie에서 선택된 ID가 넘어올 때 처리
        movie_id = self.request.query_params.get("movie_id")
        if movie_id:
            queryset = queryset.filter(movie_id=movie_id)

        # 3. 생성일자 필터 (?created_date_at=2026-01-23)
        created_date_at = self.request.query_params.get("created_date_at")
        if created_date_at:
            queryset = queryset.filter(created_date__date=created_date_at)

        return queryset.order_by("-id")  # 기본 정렬 유지


class OrderExcelExportView(APIView):
    def get(self, request):
        if not request.query_params.get("start_date"):
            return Response({"detail": "기준일자가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)
            
        viewset = OrderViewSet()
        viewset.request = request
        viewset.format_kwarg = None
        
        queryset = viewset.get_queryset()
        
        excel = ExcelGenerator(sheet_name='오더관리')
        
        # 요청하신 헤더 순서
        headers = [
            "영화", "포맷", "극장명", "개봉일", "종영일", "마지막상영", "비고", "지역", "직위", "멀티", "생성일자"
        ]
        excel.add_header(headers)
        
        data_rows = []
        for order in queryset:
            movie = order.movie
            client = order.client
            
            # 포맷 문자열 생성
            format_parts = [
                movie.media_type, movie.audio_mode, movie.viewing_dimension, 
                movie.screening_type, movie.dx4_viewing_dimension,
                movie.imax_l, movie.screen_x
            ] if movie else []
            format_str = " ".join([p for p in format_parts if p]).strip()
            
            row = [
                movie.title_ko if movie else "",
                format_str,
                client.client_name if client else "",
                order.release_date.strftime('%Y-%m-%d') if order.release_date else "",
                order.end_date.strftime('%Y-%m-%d') if order.end_date else "",
                order.last_screening_date.strftime('%Y-%m-%d') if order.last_screening_date else "",
                order.remark or "",
                client.region_code if client else "",
                client.classification if client else "",
                client.theater_kind if client else "",
                order.created_date.strftime('%Y-%m-%d %H:%M:%S') if order.created_date else ""
            ]
            data_rows.append(row)
            
        excel.add_rows(data_rows)
        filename = f"Order_List_{datetime.now().strftime('%Y%m%d')}"
        return excel.to_response(filename)