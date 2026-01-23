from rest_framework.views import APIView
from castingline_backend.utils.excel_helper import ExcelGenerator
from django.http import HttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import *
from .serializers import *
from rest_framework import viewsets, permissions
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework import filters
from rest_framework.permissions import AllowAny
from django.db.models import F
from datetime import datetime, timedelta
from django_filters.rest_framework import DjangoFilterBackend
import django_filters
from castingline_backend.utils.ordering import KoreanOrderingFilter
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.db.models import Q


class DefaultPagination(PageNumberPagination):
    page_size = 20  # 한 페이지에 보여질 항목 수 설정
    page_size_query_param = "page_size"
    max_page_size = 100  # 최대 몇개 항목까지 보여줄건지?


class RateFilter(django_filters.FilterSet):
    # ID 기반 필터 (프론트엔드 상세 리스트용)
    client_id = django_filters.NumberFilter(field_name="client_id")
    movie_id = django_filters.NumberFilter(field_name="movie_id")

    # 코드 기반 필터 (기존 유지)
    movie_code = django_filters.CharFilter(
        field_name="movie__movie_code", lookup_expr="icontains"
    )
    client_code = django_filters.CharFilter(
        field_name="client__client_code", lookup_expr="icontains"
    )

    # 영화 제목 필터 (추가 - 검색창용)
    movie_title = django_filters.CharFilter(
        field_name="movie__title_ko", lookup_expr="icontains"
    )

    client_type = django_filters.CharFilter(
        field_name="client__client_type", lookup_expr="icontains"
    )
    theater_kind = django_filters.CharFilter(
        field_name="client__theater_kind", lookup_expr="icontains"
    )
    classification = django_filters.CharFilter(
        field_name="client__classification", lookup_expr="icontains"
    )

    class Meta:
        model = Rate
        fields = [
            "client_id",
            "movie_id",
            "client_code",
            "movie_code",
            "movie_title",
            "client_type",
            "theater_kind",
            "classification",
        ]


class RateViewSet(viewsets.ModelViewSet):
    queryset = Rate.objects.all().select_related("client", "movie").order_by("-id")
    serializer_class = RateSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination

    filter_backends = [DjangoFilterBackend,
                       filters.SearchFilter, KoreanOrderingFilter]
    filterset_class = RateFilter

    # ✅ 검색 필드 설정 (movie__title_ko가 정확히 작동하게 함)
    search_fields = ["movie__title_ko", "client__client_name"]
    ordering_fields = "__all__"

    def create(self, request, *args, **kwargs):
        # 1. 요청 데이터가 리스트인지 확인
        is_many = isinstance(request.data, list)

        if not is_many:
            # 단일 생성인 경우 기존 로직 수행
            return super().create(request, *args, **kwargs)

        # 2. 리스트(Bulk) 생성인 경우
        serializer = self.get_serializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():  # 하나라도 실패하면 전체 롤백
                self.perform_bulk_create(serializer)

            headers = self.get_success_headers(serializer.data)
            return Response(
                serializer.data, status=status.HTTP_201_CREATED, headers=headers
            )
        except Exception as e:
            return Response(
                {"detail": f"일괄 등록 중 오류가 발생했습니다: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def perform_bulk_create(self, serializer):
        serializer.save()

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        ids = request.data.get("ids", [])
        if not ids:
            return Response(
                {"error": "삭제할 항목이 선택되지 않았습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ID 목록에 해당하는 데이터들을 한 번에 삭제
        deleted_count, _ = Rate.objects.filter(id__in=ids).delete()

        return Response(
            {"message": f"{deleted_count}개의 항목이 성공적으로 삭제되었습니다."},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"])
    def bulk_region_update(self, request):
        """
        지역별(서울/지방) 부율 일괄 업데이트 및 소급 적용
        - 업데이트 후 부율이 같아진 인접 구간은 자동으로 하나의 기간으로 합침 (Merge Contiguous)
        """
        filter_params = request.data.get("filter_params", {})
        base_date_str = request.data.get("base_date")
        seoul_rate = request.data.get("seoul_rate")
        province_rate = request.data.get("province_rate")

        if not base_date_str:
            return Response({"error": "기준일자가 누락되었습니다."}, status=400)

        try:
            base_date = datetime.strptime(base_date_str, "%Y-%m-%d").date()
            yesterday = base_date - timedelta(days=1)

            queryset = self.get_queryset()
            filtered_qs = RateFilter(filter_params, queryset=queryset).qs
            combinations = filtered_qs.values("client", "movie").distinct()

            affected_count = 0

            with transaction.atomic():
                for combo in combinations:
                    c_id = combo["client"]
                    m_id = combo["movie"]

                    # 1. 지역 판별 및 목표 부율 설정
                    ref_rate = filtered_qs.filter(
                        client_id=c_id, movie_id=m_id).select_related("client").first()
                    if not ref_rate:
                        continue

                    is_seoul = ref_rate.client.region_code in ["서울", "01"]
                    target_value = seoul_rate if is_seoul else province_rate

                    if target_value is None or target_value == "":
                        continue

                    # --- [Step A] 업데이트 및 분리 로직 ---
                    target_rate = Rate.objects.filter(
                        client_id=c_id, movie_id=m_id,
                        start_date__lte=base_date
                    ).filter(
                        Q(end_date__gte=base_date) | Q(end_date__isnull=True)
                    ).first()

                    if target_rate:
                        if target_rate.share_rate != target_value:
                            if target_rate.start_date == base_date:
                                target_rate.share_rate = target_value
                                target_rate.save()
                            else:
                                original_end_date = target_rate.end_date
                                target_rate.end_date = yesterday
                                target_rate.save()

                                Rate.objects.create(
                                    client_id=c_id, movie_id=m_id,
                                    start_date=base_date, end_date=original_end_date,
                                    share_rate=target_value
                                )
                            affected_count += 1
                    else:
                        # 소급 생성 체크
                        earliest = Rate.objects.filter(
                            client_id=c_id, movie_id=m_id).order_by("start_date").first()
                        if earliest and base_date < earliest.start_date:
                            if earliest.share_rate == target_value:
                                earliest.start_date = base_date
                                earliest.save()
                            else:
                                Rate.objects.create(
                                    client_id=c_id, movie_id=m_id,
                                    start_date=base_date,
                                    end_date=earliest.start_date -
                                    timedelta(days=1),
                                    share_rate=target_value
                                )
                            affected_count += 1

                    # --- [Step B] 핵심: 인접 구간 통합 로직 (Merge Adjacent Records) ---
                    # 처리가 끝난 후 해당 극장/영화의 모든 데이터를 시작일 순으로 정렬하여 검사
                    all_rates = list(Rate.objects.filter(
                        client_id=c_id, movie_id=m_id).order_by("start_date"))

                    if len(all_rates) > 1:
                        prev = all_rates[0]
                        for current in all_rates[1:]:
                            # 부율이 같고 기간이 딱 붙어 있다면 (어제-오늘)
                            if prev.share_rate == current.share_rate:
                                # 이전 데이터의 종료일이 현재 데이터의 시작일 바로 전날이라면 통합
                                if prev.end_date == (current.start_date - timedelta(days=1)):
                                    prev.end_date = current.end_date
                                    prev.save()
                                    current.delete()  # 현재 레코드 삭제 (이전에 합쳐짐)
                                    # prev는 유지한 채 다음 루프로 진행
                                else:
                                    prev = current
                            else:
                                prev = current

            return Response({
                "message": "부율 데이터 최적화 및 통합 업데이트가 완료되었습니다.",
                "affected_combinations": affected_count
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({"error": str(e)}, status=500)


class TheaterRateFilter(django_filters.FilterSet):
    # rate_id로 직접 필터링할 수 있도록 추가
    rate_id = django_filters.NumberFilter(field_name="rate_id")
    theater_id = django_filters.NumberFilter(field_name="theater_id")
    client_id = django_filters.NumberFilter(field_name="theater__client_id")

    class Meta:
        model = TheaterRate
        fields = ["rate_id", "theater_id", "client_id"]


# 2. ViewSet 정의
class TheaterRateViewSet(viewsets.ModelViewSet):
    # N+1 쿼리 방지를 위한 select_related
    queryset = TheaterRate.objects.all().select_related("theater", "theater__client")

    serializer_class = TheaterRateSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination  # 기존에 정의하신 페이징 클래스 사용

    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = TheaterRateFilter
    ordering_fields = "__all__"


class DefaultRateViewSet(viewsets.ModelViewSet):
    queryset = DefaultRate.objects.all().order_by("theater_kind")
    serializer_class = DefaultRateSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination
    filter_backends = [DjangoFilterBackend,
                       filters.SearchFilter, KoreanOrderingFilter]

    # ✅ 프론트엔드에서 특정 클라이언트의 부율만 가져올 수 있도록 필터 추가
    filterset_fields = ["client"]

    # ✅ 모델명 오타 수정 (Rate -> DefaultRate)
    ordering_fields = "__all__"


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [AllowAny]
    pagination_class = DefaultPagination

    def get_queryset(self):
        rate_exists = Rate.objects.filter(
            client=OuterRef("client"), movie=OuterRef("movie")
        )

        queryset = (
            Order.objects.annotate(has_rate=Exists(rate_exists))
            .select_related("client", "movie")
            .order_by("-release_date")
        )

        movie_code = self.request.query_params.get("movie_code")
        client_code = self.request.query_params.get("client_code")
        # ✅ 새 필터 파라미터 추가
        missing_rate_only = self.request.query_params.get("missing_rate_only")

        if movie_code:
            queryset = queryset.filter(movie__movie_code=movie_code)
        if client_code:
            queryset = queryset.filter(client__client_code=client_code)

        # ✅ 부율 미등록 극장만 보기 필터 적용
        if missing_rate_only == "true":
            queryset = queryset.filter(has_rate=False)

        return queryset


class RateExcelExportView(APIView):
    def get(self, request):
        """
        프론트엔드에서 보낸 쿼리 파라미터를 그대로 사용하여 필터링
        페이지네이션은 무시하고 필터된 전체 데이터를 엑셀로 출력
        극장명(movie_code/movie_id/movie_title) 또는 영화명(client_code/client_id) 중 하나는 필수
        """
        # 필수 필터 검증: 극장명 또는 영화명 중 하나는 필수
        movie_code = request.query_params.get("movie_code")
        movie_id = request.query_params.get("movie_id")
        movie_title = request.query_params.get("movie_title")
        client_code = request.query_params.get("client_code")
        client_id = request.query_params.get("client_id")
        
        has_movie_filter = movie_code or movie_id or movie_title
        has_client_filter = client_code or client_id
        
        if not has_movie_filter and not has_client_filter:
            return HttpResponse(
                "엑셀 다운로드를 위해서는 극장명 또는 영화명 중 하나는 필수로 입력해야 합니다.", 
                status=400
            )
        
        # 리스트 뷰와 동일한 필터 조건 재사용
        viewset = RateViewSet()
        viewset.request = request
        viewset.format_kwarg = None
        
        # 기본 queryset 가져오기 (페이지네이션 파라미터는 무시됨)
        queryset = viewset.get_queryset()
        
        # 프론트엔드에서 보낸 쿼리 파라미터로 필터 적용 (RateFilter + SearchFilter)
        queryset = viewset.filter_queryset(queryset)
        
        # 정렬 적용 (엑셀 출력용 정렬)
        queryset = queryset.order_by('client__client_name', 'start_date')
        
        # annotate 추가 (엑셀 출력용)
        queryset = queryset.annotate(
            c_code=F('client__client_code'),
            c_name=F('client__client_name'),
            c_class=F('client__classification'),
            c_region=F('client__region_code'),
            c_kind=F('client__theater_kind'),
            m_title=F('movie__title_ko')
        )

        if not queryset.exists():
            return HttpResponse("조회된 부율 데이터가 없습니다.", status=404)

        # 2. ExcelGenerator 초기화
        excel = ExcelGenerator(sheet_name="전체극장부율")

        # 3. 헤더 정의
        headers = ["극장코드", "극장명", "영화명", "직영구분",
                   "멀티구분", "지역", "시작일자", "종료일자", "부율(%)"]
        excel.add_header(headers)

        # 4. 데이터 행 구성
        data_rows = []
        for r in queryset:
            data_rows.append([
                r.c_code,
                r.c_name,
                r.m_title,
                r.c_class,
                r.c_kind,
                r.c_region,
                r.start_date.strftime("%Y-%m-%d") if r.start_date else "",
                r.end_date.strftime("%Y-%m-%d") if r.end_date else "",
                r.share_rate  # 자동 콤마 및 숫자 서식 적용됨
            ])

        excel.add_rows(data_rows)

        # 5. 파일명 설정 및 반환
        movie_title = queryset[0].m_title if queryset.exists() else "Movie"
        filename = f"Total_Rate_{movie_title}_{datetime.now().strftime('%Y%m%d')}"
        return excel.to_response(filename)
