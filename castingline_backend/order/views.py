from .models import *
from .serializers import *
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from django.db.models import F, Q
from django.db.models.functions import Coalesce
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


def movie_scope_q(movie_id, prefix="movie"):
    """영화 필터 Q 객체. 대표영화를 고르면 하위 포맷 영화까지 함께 조회한다.

    오더/스코어는 하위영화(포맷) 단위로 생성되므로 대표영화 id 하나로만 걸면
    결과가 비어 버린다. 예: <눈동자> 선택 → <눈동자(디지털 2D)>, <눈동자(ATMOS Dolby)> 포함.
    """
    from movie.models import Movie

    try:
        movie = Movie.objects.only(
            'id', 'movie_code', 'is_primary_movie').get(pk=movie_id)
    except (Movie.DoesNotExist, ValueError, TypeError):
        return Q(**{f"{prefix}_id": movie_id})

    if not movie.is_primary_movie or not movie.movie_code:
        return Q(**{f"{prefix}_id": movie.id})

    sub_ids = list(
        Movie.objects.filter(primary_movie_code=movie.movie_code)
        .exclude(pk=movie.pk)
        .values_list('id', flat=True)
    )
    return Q(**{f"{prefix}_id__in": [movie.id] + sub_ids})


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
    ordering_field_map = {
        'movie': 'movie__title_ko',
        'client': 'client__client_name',
        'format': 'movie__screening_type',
        'region_code': 'client__region_code',
        'classification': 'client__classification',
        'theater_kind': 'client__theater_kind',
    }

    def get_queryset(self):
        # 1. 기본 쿼리셋 가져오기
        queryset = super().get_queryset()

        # 2. URL 파라미터들 가져오기
        ol_id = self.request.query_params.get("id")  # OrderList ID
        filter_start_date = self.request.query_params.get("start_date")  # 기준일자
        filter_client_id = self.request.query_params.get("client_id")  # 극장 ID

        # 3. OrderList ID가 있으면 해당 영화의 오더들만 1차 필터링.
        #    대표영화(포맷 없는 상위 영화)를 고르면 하위 포맷 오더까지 모두 보여준다.
        #    예: <눈동자> 선택 → <눈동자(디지털 2D)>·<눈동자(ATMOS Dolby)> 상세 내역 전부
        if ol_id:
            try:
                base_order = OrderList.objects.get(id=ol_id)
                queryset = queryset.filter(movie_scope_q(base_order.movie_id))
            except OrderList.DoesNotExist:
                return queryset.none()

        # 4. ✅ 기준일자 필터링 (start_date): "기준일자 이후 상영 이력이 있는" 오더.
        #    개봉일 기준(release_date >= d)이면 그 이전에 개봉해 계속 상영 중인 극장이
        #    다 빠지므로, 마지막상영일 → 종영일 → 개봉일 순으로 있는 값과 비교한다.
        if filter_start_date:
            queryset = queryset.annotate(
                _active_until=Coalesce("last_screening_date", "end_date", "release_date")
            ).filter(_active_until__gte=filter_start_date)

        # 5. ✅ 추가 로직: 특정 극장 필터링 (client_id)
        if filter_client_id:
            queryset = queryset.filter(client_id=filter_client_id)

        # 6. KOBIS 연동 여부 필터 (?kobis_linked=true|false)
        #    영진위 상세내역에 스코어가 넘어오지 않는 극장만 따로 보기 위한 필터
        kobis_linked = self.request.query_params.get("kobis_linked")
        if kobis_linked in ("true", "false"):
            queryset = queryset.filter(client__kobis_linked=(kobis_linked == "true"))

        # 7. 영화를 고르지 않고 극장만 검색한 경우: 개봉일이 최신인 영화가 위로 (O001)
        if filter_client_id and not ol_id and not self.request.query_params.get("ordering"):
            queryset = queryset.order_by(
                F("release_date").desc(nulls_last=True), "-id"
            )

        return queryset

    def destroy(self, request, *args, **kwargs):
        # 1. 삭제하려는 대상(Order) 객체 가져오기
        instance = self.get_object()

        # 1-1. 같은 (극장, 영화) 오더가 더 있으면 이 건은 중복 등록분이다.
        #      남은 오더가 스코어를 그대로 커버하므로 스코어 검사 없이 삭제한다. (O004)
        if (
            Order.objects.filter(client=instance.client, movie=instance.movie)
            .exclude(pk=instance.pk)
            .exists()
        ):
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)

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

        # 중복 오더 등록 방지 (O003) — 영화(=포맷 단위 하위영화) × 극장이 같으면 차단
        if movie_id and client_id:
            existing = (
                Order.objects.filter(movie_id=movie_id, client_id=client_id)
                .select_related("movie", "client")
                .first()
            )
            if existing:
                movie_name = existing.movie.title_ko if existing.movie else ""
                client_name = existing.client.client_name if existing.client else ""
                return Response(
                    {
                        "detail": f"이미 등록된 오더입니다. ({client_name} / {movie_name})",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # 시리얼라이저를 통한 저장 (여기서 내부적으로 perform_create가 호출됨)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )

    def perform_create(self, serializer):
        # Order(오더 상세 내역) 저장
        order = serializer.save()

        # ✅ 해당 영화의 OrderList(오더)가 없으면 자동 생성 (OneToOne 중복 방지)
        if order.movie_id:
            OrderList.objects.get_or_create(
                movie_id=order.movie_id,
                defaults={
                    "start_date": order.start_date or order.release_date,
                    "is_auto_generated": True,
                    "remark": "오더 생성 시 자동 생성",
                },
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
    ordering_field_map = {
        'movie': 'movie__title_ko',
        'distributor': 'movie__distributor__client_name',
        'production_company': 'movie__production_company__client_name',
        'release_date': 'movie__release_date',
        'end_date': 'movie__end_date',
        'movie_code': 'movie__movie_code',
    }

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
        # 대표영화(포맷 없는 상위 영화)를 고르면 그 하위 포맷 오더까지 모두 조회한다.
        # (오더는 하위영화 단위로 생성되므로 대표영화 id로만 걸면 아무것도 안 나온다.)
        movie_id = self.request.query_params.get("movie_id")
        if movie_id:
            queryset = queryset.filter(movie_scope_q(movie_id, prefix="movie"))

        # 3. 생성일자 필터 (?created_date_at=2026-01-23)
        created_date_at = self.request.query_params.get("created_date_at")
        if created_date_at:
            queryset = queryset.filter(created_date__date=created_date_at)

        return queryset.order_by("-id")  # 기본 정렬 유지


class OrderExcelExportView(APIView):
    def get(self, request):
        # 극장명만으로 조회한 결과도 다운로드할 수 있어야 한다 (O002)
        if not any(
            request.query_params.get(k) for k in ("start_date", "id", "client_id")
        ):
            return Response(
                {"detail": "영화·기준일자·극장명 중 하나는 지정해주세요."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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