from rest_framework.decorators import api_view, parser_classes
from .score_parsers import *
from rest_framework.parsers import MultiPartParser, FormParser
from django.db.models import (
    Sum,
    Count,
    F,
    Q,
    ExpressionWrapper,
    IntegerField,
    Value,
    CharField,
)
from django.db.models.functions import Cast, Concat
import django_filters
from .models import Score

from rest_framework import viewsets, filters
from rest_framework.permissions import AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from .models import Score
from .serializers import ScoreSerializer

from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Score
from django.db.models import (
    Count,
    Sum,
    F,
    Q,
    ExpressionWrapper,
    IntegerField,
    Value,
    CharField,
    Min,
)
from django.db.models.functions import Cast, Concat, Coalesce
from datetime import datetime, timedelta
from movie.models import Movie
from collections import defaultdict
from django.db.models.functions import Trim
from rest_framework.decorators import action


class ScoreFilter(django_filters.FilterSet):
    entry_date = django_filters.DateFilter(
        field_name="entry_date",
        lookup_expr="exact",
    )
    client_name = django_filters.CharFilter(
        field_name="client__client_name",
        lookup_expr="icontains",
    )
    movie_title = django_filters.CharFilter(
        field_name="movie__title_ko", lookup_expr="icontains"
    )

    class Meta:
        model = Score
        fields = ["entry_date", "client_name"]


class DefaultPagination(PageNumberPagination):
    page_size = 20  # 한 페이지에 보여질 항목 수 설정
    page_size_query_param = "page_size"
    max_page_size = 100  # 최대 몇개 항목까지 보여줄건지?


class ScoreViewSet(viewsets.ModelViewSet):
    queryset = Score.objects.all().select_related("client", "movie")
    serializer_class = ScoreSerializer
    authentication_classes = []
    permission_classes = [AllowAny]
    pagination_class = None

    # ✅ 스코어가 생성(POST)될 때 실행되는 메서드
    def perform_create(self, serializer):
        # 1. 스코어 객체 저장
        score = serializer.save()

        # 2. OrderList 중복 방지 (OneToOneField 기준)
        # 이미 해당 영화에 대한 OrderList가 있으면 가져오고, 없으면 새로 생성합니다.
        order_list, ol_created = OrderList.objects.get_or_create(
            movie=score.movie,
            defaults={
                "start_date": score.entry_date,
                "is_auto_generated": True,
                "remark": f"{score.entry_date} 스코어 추가 시 자동 생성",
            },
        )

        # 3. Order 중복 방지 및 업데이트 (ForeignKey 기준)
        order, o_created = Order.objects.get_or_create(
            client=score.client,
            movie=score.movie,
            defaults={
                "start_date": score.entry_date,
                "release_date": score.entry_date,
                "last_screening_date": score.entry_date,
                "is_auto_generated": True,
                "remark": f"{score.entry_date} 스코어 추가 시 자동 생성",
            },
        )

        if not o_created:
            # 기존 오더가 있으면 날짜 업데이트
            changed = False
            if not order.release_date or score.entry_date < order.release_date:
                order.release_date = score.entry_date
                order.start_date = score.entry_date
                changed = True
            if (
                not order.last_screening_date
                or score.entry_date > order.last_screening_date
            ):
                order.last_screening_date = score.entry_date
                changed = True
            if changed:
                order.save()

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        ids = request.data.get("ids", [])

        if not ids:
            return Response({"error": "삭제할 데이터 ID가 없습니다."}, status=400)

        # queryset.delete()는 데이터베이스 단에서 한 번에 삭제를 수행합니다.
        deleted_count, _ = Score.objects.filter(id__in=ids).delete()

        return Response(
            {"message": f"{deleted_count}건의 데이터가 한 번에 삭제되었습니다."},
            status=200,
        )

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """영화별 알짜배기 극장 일자별 Top 10 조회 API (movie_id 기반)"""
        movie_id = request.query_params.get("movie_id")
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        
        if not movie_id or not year or not month:
            return Response({"error": "영화 ID, 연도, 월이 모두 필요합니다."}, status=400)

        try:
            primary_movie = Movie.objects.get(id=movie_id)
            # 대표 영화 코드 정제 (공란 제거 등)
            clean_parent_code = (primary_movie.movie_code or "").replace(" ", "")
        except Movie.DoesNotExist:
            return Response({"error": "해당 영화를 찾을 수 없습니다."}, status=404)

        # 1. 스코어 집계: 일자(entry_date), 극장(client), 상영관(auditorium) 기준 그룹화
        # 본인(대표영화) + 본인을 부모로 둔 모든 하위(프린트) 영화들의 데이터를 포함
        scores = (
            Score.objects.annotate(
                clean_primary_code=Replace(F('movie__primary_movie_code'), Value(' '), Value('')),
                clean_movie_code=Replace(F('movie__movie_code'), Value(' '), Value(''))
            ).filter(
                (Q(movie_id=movie_id) | Q(clean_primary_code=clean_parent_code) | Q(clean_movie_code=clean_parent_code)),
                entry_date__year=year,
                entry_date__month=month
            )
            .values('entry_date', 'client__client_name', 'client_id', 'auditorium')
            .annotate(
                total_visitor=Sum(Cast("visitor", IntegerField())),
                total_show=Count("id")
            )
        )

        if not scores:
            return Response({"top_theaters": []})

        # 2. 극장 좌석 정보 조회
        from client.models import Theater
        client_ids = [s['client_id'] for s in scores]
        theater_map = {
            f"{t['client_id']}_{t['auditorium']}": t['seat_count']
            for t in Theater.objects.filter(client_id__in=client_ids).values('client_id', 'auditorium', 'seat_count')
        }

        # 3. 효율성 계산 (일자별/상영관별 최고 효율 추출)
        results = []
        for s in scores:
            key = f"{s['client_id']}_{s['auditorium']}"
            try:
                seat_count = int(theater_map.get(key, 0) or 0)
                total_show = int(s['total_show'] or 0)
                
                if seat_count > 0 and total_show > 0:
                    capacity = seat_count * total_show
                    efficiency = round((int(s['total_visitor'] or 0) / capacity) * 100, 2)
                    
                    results.append({
                        "id": f"{s['entry_date'].strftime('%Y%m%d')}_{s['client_id']}_{s['auditorium']}",
                        "date": s['entry_date'].strftime("%Y-%m-%d"),
                        "theater": s['client__client_name'],
                        "auditorium": s['auditorium'],
                        "efficiency": efficiency,
                        "visitor": int(s['total_visitor'] or 0),
                        "capacity": capacity,
                        "seat_count": seat_count,
                        "show_count": total_show
                    })
            except (ValueError, TypeError):
                continue

        # 4. 효율성 순으로 정렬 후 Top 10 추출
        top_theaters = sorted(results, key=lambda x: x['efficiency'], reverse=True)[:10]

        return Response({"top_theaters": top_theaters})


    def list(self, request, *args, **kwargs):
        # [NEW] 대시보드용: 오늘 생성된 스코어 개수 조회
        created_date_str = request.query_params.get("created_date")
        if created_date_str:
            count = Score.objects.filter(created_date__date=created_date_str).count()
            return Response({"score_count": count})

        entry_date_str = request.query_params.get("entry_date")
        if not entry_date_str:
            return Response({"grouped_data": [], "grand_total_visitor": 0})

        entry_date = datetime.strptime(entry_date_str, "%Y-%m-%d").date()

        # 1. 해당 날짜에 상영 중인 오더(Order) 조회
        # 개봉일 <= 입회일 <= 마지막상영일(또는 종영일)
        limit_date = entry_date - timedelta(days=180) 

        active_orders = Order.objects.filter(
            Q(release_date__lte=entry_date) & 
            (
                # 1. 종영일이 입력되어 있고, 입회일보다 미래인 경우
                Q(end_date__gte=entry_date) | 
                # 2. 혹은 종영일이 없더라도, 개봉한 지 180일이 지나지 않은 경우
                (Q(end_date__isnull=True) & Q(release_date__gte=limit_date))
            ),
            client__isnull=False,
            movie__isnull=False
        ).select_related('client', 'movie')
        # 2. 해당 날짜의 기존 스코어(Score) 조회
        scores_queryset = self.get_queryset().filter(entry_date=entry_date)

        # 필터 적용 (극장명, 영화명 검색 시)
        client_name = request.query_params.get("client_name")
        movie_title = request.query_params.get("movie_title")
        if client_name:
            active_orders = active_orders.filter(
                client__client_name__icontains=client_name)
            scores_queryset = scores_queryset.filter(
                client__client_name__icontains=client_name)
        if movie_title:
            active_orders = active_orders.filter(
                movie__title_ko__icontains=movie_title)
            scores_queryset = scores_queryset.filter(
                movie__title_ko__icontains=movie_title)

        # 3. 데이터 매핑 준비
        # {(client_id, movie_id): [score_objects]} 구조로 저장
        score_map = defaultdict(list)
        for s in scores_queryset:
            score_map[(s.client_id, s.movie_id)].append(
                ScoreSerializer(s).data)

        # 4. 오더 기준으로 결과 생성
        final_items = []
        for order in active_orders:
            existing_scores = score_map.get(
                (order.client_id, order.movie_id), [])

            if existing_scores:
                # 이미 스코어가 있는 경우: 기존 스코어들을 추가
                for s_data in existing_scores:
                    final_items.append(s_data)
            else:
                # 스코어가 없는 경우: 오더 정보를 바탕으로 빈 스코어 틀(Virtual Score) 생성
                final_items.append({
                    "id": None,  # ID가 없으므로 프론트에서 신규 항목으로 인식
                    "client": {
                        "id": order.client.id,
                        "client_code": order.client.client_code,
                        "client_name": order.client.client_name
                    },
                    "movie": {
                        "id": order.movie.id,
                        "movie_code": order.movie.movie_code,
                        "title_ko": order.movie.title_ko
                    },
                    "entry_date": entry_date_str,
                    "auditorium": None,
                    "auditorium_name": "미입력",
                    "fare": None,
                    "visitor": 0,
                    "is_order_only": True  # 오더 목록에서 온 것임을 표시 (선택 사항)
                })

        # 5. 실제 스코어 개수 집계 (ID가 있는 항목)
        actual_score_count = sum(1 for item in final_items if item.get("id"))

        # 6. 영화별 그룹화 (기존 로직 유지)
        grouped_dict = defaultdict(list)
        grand_total_visitor = 0
        for item in final_items:
            grand_total_visitor += int(item.get("visitor") or 0)
            movie_code = item["movie"]["movie_code"] if item["movie"] else "unknown"
            grouped_dict[movie_code].append(item)

        final_grouped_data = []
        for movie_code, items in grouped_dict.items():
            subtotal = sum(int(it.get("visitor") or 0) for it in items)
            final_grouped_data.append({
                "movie_name": items[0]["movie"]["title_ko"] if items[0]["movie"] else "정보 없음",
                "movie_code": movie_code,
                "items": items,
                "subtotal_visitor": subtotal,
            })

        return Response({
            "grouped_data": final_grouped_data,
            "grand_total_visitor": grand_total_visitor,
            "score_count": actual_score_count,
        })


def get_movie_ids_for_primary(movie_id):
    try:
        primary = Movie.objects.get(id=movie_id, is_primary_movie=True)
    except Movie.DoesNotExist:
        return []

    base_code = primary.movie_code.strip()

    related_movies = Movie.objects.annotate(
        trimmed_code=Trim("primary_movie_code")
    ).filter(Q(movie_code=base_code) | Q(trimmed_code=base_code))

    return list(related_movies.values_list("id", flat=True))


@api_view(["GET"])
def score_summary(request):
    sort_by = request.query_params.get("sort_by", "region")
    movie_id = request.query_params.get("movie_id")

    if not movie_id:
        return Response({"error": "movie_id is required"}, status=400)

    if sort_by == "version":
        return score_by_version(movie_id, request)
    elif sort_by == "multi":
        return score_by_multi(movie_id, request)
    else:
        return score_by_region(movie_id, request)


def apply_common_filters(qs, request):
    region = request.query_params.get("region")
    multi = request.query_params.get("multi")
    theater_type = request.query_params.get("theater_type")

    # 1. "전체"가 아닐 때만 필터를 적용하도록 조건 추가
    if region and region != "전체":
        qs = qs.filter(client__region_code=region)

    if multi and multi != "전체":
        qs = qs.filter(client__theater_kind=multi)

    if theater_type and theater_type != "전체":
        # 2. 에러 발생 지점: client__type -> 실제 Client 모델의 필드명으로 수정
        # 만약 필드명이 'client_type'이라면 아래와 같이 수정해야 합니다.
        qs = qs.filter(client__client_type=theater_type)

    return qs


def score_by_region(movie_id, request):
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")
    compare_mode = request.query_params.get("compare_mode", "daily")

    movie_ids = get_movie_ids_for_primary(movie_id)
    if not date_from_str or not movie_ids:
        return Response({"error": "필수 파라미터 누락"}, status=400)

    # 📅 1. 날짜 계산
    base_date_dt = datetime.strptime(date_from_str, "%Y-%m-%d")
    prev_days = 7 if compare_mode == "weekly" else 1
    prev_date_str = (base_date_dt - timedelta(days=prev_days)
                     ).strftime("%Y-%m-%d")

    # 2. 쿼리셋 (기준일과 대조일 데이터 포함)
    qs = Score.objects.filter(
        movie_id__in=movie_ids, entry_date__in=[date_from_str, prev_date_str]
    )
    qs = apply_common_filters(qs, request)

    # 데이터 가공: 스크린 식별키(극장+상영관) 및 매출 계산용 필드 생성
    qs = qs.annotate(
        v_int=Cast("visitor", IntegerField()),
        f_int=Cast("fare", IntegerField()),
        # ✅ 스크린 수 집계를 위한 고유 키 생성
        screen_key=Concat(Cast("client_id", CharField()),
                          Value("-"), "auditorium"),
    ).annotate(
        row_revenue=ExpressionWrapper(
            F("v_int") * F("f_int"), output_field=IntegerField()
        )
    )

    # 3. 기준일(date_from) 데이터 상세 집계
    today_stats = (
        qs.filter(entry_date=date_from_str)
        .values(section=F("client__region_code"))
        .annotate(
            visitors=Sum("v_int"),
            theaters=Count("client_id", distinct=True),
            # ✅ 추가: 스크린수와 기준일 총요금 집계
            screens=Count("screen_key", distinct=True),
            base_fare=Sum("row_revenue"),
        )
    )
    today_dict = {item["section"]: item for item in today_stats}

    # 4. 비교일(prev_date_str) 데이터 집계
    prev_stats = (
        qs.filter(entry_date=prev_date_str)
        .values(section=F("client__region_code"))
        .annotate(
            visitors=Sum("v_int"),
            theaters=Count("client_id", distinct=True),
        )
    )
    prev_dict = {item["section"]: item for item in prev_stats}

    # 5. 전체 누계용 쿼리 (기존 유지)
    total_qs = Score.objects.filter(
        movie_id__in=movie_ids, entry_date__lte=date_to_str)
    total_qs = apply_common_filters(total_qs, request)
    total_stats = (
        total_qs.values(section=F("client__region_code"))
        .annotate(
            total_visitors=Sum(Cast("visitor", IntegerField())),
            total_fare=Sum(
                ExpressionWrapper(
                    Cast("visitor", IntegerField()) *
                    Cast("fare", IntegerField()),
                    output_field=IntegerField(),
                )
            ),
        )
        .order_by("-total_fare")
    )

    # 6. 결과 조합
    results = []
    for row in total_stats:
        sec = row["section"]
        t_data = today_dict.get(
            sec, {"visitors": 0, "theaters": 0, "screens": 0, "base_fare": 0}
        )
        p_data = prev_dict.get(sec, {"visitors": 0, "theaters": 0})

        row.update(
            {
                "base_day_visitors": t_data["visitors"] or 0,
                "prev_day_visitors": p_data["visitors"] or 0,
                "theater_count": t_data["theaters"] or 0,
                # ✅ 추가: 스크린수와 기준일 총요금 업데이트
                "screen_count": t_data["screens"] or 0,
                "base_day_fare": t_data["base_fare"] or 0,
                "prev_theater_count": p_data["theaters"] or 0,
                "theater_change": (t_data["theaters"] or 0) - (p_data["theaters"] or 0),
            }
        )
        results.append(row)

    return Response(results)


def score_by_multi(movie_id, request):
    # 1. 파라미터 추출
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")
    compare_mode = request.query_params.get("compare_mode", "daily")

    movie_ids = get_movie_ids_for_primary(movie_id)
    if not date_from_str or not movie_ids:
        return Response({"error": "필수 파라미터가 누락되었습니다."}, status=400)

    # 2. 📅 대조 시점(prev_date) 계산
    base_date_dt = datetime.strptime(date_from_str, "%Y-%m-%d")
    prev_days = 7 if compare_mode == "weekly" else 1
    prev_date_str = (base_date_dt - timedelta(days=prev_days)
                     ).strftime("%Y-%m-%d")

    # 3. 포인트 데이터 쿼리셋 (기준일 & 대조일)
    qs_points = Score.objects.filter(
        movie_id__in=movie_ids, entry_date__in=[date_from_str, prev_date_str]
    )
    qs_points = apply_common_filters(qs_points, request)

    # 데이터 가공: 스크린 식별키 및 매출 필드 생성
    qs_points = qs_points.annotate(
        v_int=Cast("visitor", IntegerField()),
        f_int=Cast("fare", IntegerField()),
        screen_key=Concat(Cast("client_id", CharField()),
                          Value("-"), "auditorium"),
    ).annotate(
        row_revenue=ExpressionWrapper(
            F("v_int") * F("f_int"), output_field=IntegerField()
        )
    )

    # [기준일 집계] - 스크린수와 총요금 포함
    today_stats = (
        qs_points.filter(entry_date=date_from_str)
        .values(section=F("client__theater_kind"))
        .annotate(
            visitors=Sum("v_int"),
            theaters=Count("client_id", distinct=True),
            screens=Count("screen_key", distinct=True),  # ✅ 스크린 수
            base_fare=Sum("row_revenue"),  # ✅ 기준일 총요금
        )
    )
    today_dict = {item["section"]: item for item in today_stats}

    # [대조일 집계] - 증감 계산용
    prev_stats = (
        qs_points.filter(entry_date=prev_date_str)
        .values(section=F("client__theater_kind"))
        .annotate(visitors=Sum("v_int"), theaters=Count("client_id", distinct=True))
    )
    prev_dict = {item["section"]: item for item in prev_stats}

    # 4. 전체 누계 데이터 집계 (개봉일 ~ date_to)
    qs_total = Score.objects.filter(
        movie_id__in=movie_ids, entry_date__lte=date_to_str)
    qs_total = apply_common_filters(qs_total, request)

    total_stats = (
        qs_total.annotate(
            v_int=Cast("visitor", IntegerField()), f_int=Cast("fare", IntegerField())
        )
        .annotate(
            row_revenue=ExpressionWrapper(
                F("v_int") * F("f_int"), output_field=IntegerField()
            )
        )
        .values(section=F("client__theater_kind"))
        .annotate(
            total_visitors=Sum("v_int"),
            total_fare=Sum("row_revenue"),
        )
        .order_by("-total_fare")
    )

    # 5. 결과 조합 및 필드 매핑
    results = []
    for row in total_stats:
        sec = row["section"]
        t_data = today_dict.get(
            sec, {"visitors": 0, "theaters": 0, "screens": 0, "base_fare": 0}
        )
        p_data = prev_dict.get(sec, {"visitors": 0, "theaters": 0})

        row.update(
            {
                "base_day_visitors": t_data["visitors"] or 0,
                "prev_day_visitors": p_data["visitors"] or 0,
                "theater_count": t_data["theaters"] or 0,
                "screen_count": t_data["screens"] or 0,  # ✅ 프론트엔드 매핑
                "base_day_fare": t_data["base_fare"] or 0,  # ✅ 프론트엔드 매핑
                "prev_theater_count": p_data["theaters"] or 0,
                "theater_change": (t_data["theaters"] or 0) - (p_data["theaters"] or 0),
            }
        )
        results.append(row)

    return Response(results)


def score_by_version(movie_id, request):
    # 1. 파라미터 추출
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")
    compare_mode = request.query_params.get("compare_mode", "daily")

    if not date_from_str or not movie_id:
        return Response({"error": "영화 ID와 시작일이 필요합니다."}, status=400)

    # 2. 📅 대조 시점(prev_date) 계산
    base_date_dt = datetime.strptime(date_from_str, "%Y-%m-%d")
    prev_days = 7 if compare_mode == "weekly" else 1
    prev_date_str = (base_date_dt - timedelta(days=prev_days)
                     ).strftime("%Y-%m-%d")

    # 3. 🎬 대표 영화 코드를 기준으로 모든 버전 객체 찾기
    try:
        target_movie = Movie.objects.get(id=movie_id)
        # 공백 제거 필수
        root_code = (
            target_movie.primary_movie_code.strip()
            if not target_movie.is_primary_movie
            else target_movie.movie_code.strip()
        )

        related_movies = Movie.objects.filter(
            Q(movie_code=root_code) | Q(primary_movie_code__icontains=root_code)
        )
    except Movie.DoesNotExist:
        return Response({"error": "영화 정보를 찾을 수 없습니다."}, status=404)

    movie_map = {}
    related_ids = []
    for m in related_movies:
        related_ids.append(m.id)
        # ✅ 기존의 "2D DOLBY" 형식 명칭 조립
        v_name = " ".join(
            filter(None, [m.viewing_dimension,
                   m.audio_dimension, m.screening_type])
        ).strip()
        movie_map[m.id] = v_name or m.title_ko

    # 4. 전체 쿼리셋 (가공 필드 포함)
    qs_base = Score.objects.filter(movie_id__in=related_ids)
    qs_base = apply_common_filters(qs_base, request)
    qs_base = qs_base.annotate(
        v_int=Cast("visitor", IntegerField()),
        f_int=Cast("fare", IntegerField()),
        screen_key=Concat(Cast("client_id", CharField()),
                          Value("-"), "auditorium"),
    ).annotate(
        row_revenue=ExpressionWrapper(
            F("v_int") * F("f_int"), output_field=IntegerField()
        )
    )

    # 5. 포인트 데이터 집계 (기준일 & 대조일)
    point_stats = (
        qs_base.filter(entry_date__in=[date_from_str, prev_date_str])
        .values("movie_id", "entry_date")
        .annotate(
            visitors=Sum("v_int"),
            theaters=Count("client_id", distinct=True),
            screens=Count("screen_key", distinct=True),
            base_fare=Sum("row_revenue"),
        )
    )

    # ✅ [핵심 수정] 데이터 매핑 시 entry_date를 문자열로 변환
    point_map = {}
    for item in point_stats:
        m_id = item["movie_id"]
        # entry_date가 객체일 수 있으므로 문자열("YYYY-MM-DD")로 변환하여 저장
        e_date = (
            item["entry_date"].strftime("%Y-%m-%d")
            if hasattr(item["entry_date"], "strftime")
            else str(item["entry_date"])
        )

        if m_id not in point_map:
            point_map[m_id] = {}
        point_map[m_id][e_date] = item

    # 6. 전체 누계 데이터 집계
    total_stats = (
        qs_base.filter(entry_date__lte=date_to_str)
        .values("movie_id")
        .annotate(total_visitors=Sum("v_int"), total_fare=Sum("row_revenue"))
    )
    total_dict = {item["movie_id"]: item for item in total_stats}

    # 7. 결과 조합
    results = []
    for m_id, label in movie_map.items():
        # point_map에서 문자열 키로 조회하므로 이제 데이터가 정확히 잡힙니다.
        m_points = point_map.get(m_id, {})
        t_data = m_points.get(
            date_from_str, {"visitors": 0, "theaters": 0,
                            "screens": 0, "base_fare": 0}
        )
        p_data = m_points.get(prev_date_str, {"visitors": 0, "theaters": 0})
        tot = total_dict.get(m_id, {"total_visitors": 0, "total_fare": 0})

        if tot["total_visitors"] > 0 or t_data["visitors"] > 0:
            results.append(
                {
                    "section": label,
                    "base_day_visitors": t_data["visitors"] or 0,
                    "prev_day_visitors": p_data["visitors"] or 0,
                    "theater_count": t_data["theaters"] or 0,
                    "screen_count": t_data["screens"] or 0,
                    "base_day_fare": t_data["base_fare"] or 0,
                    "total_visitors": tot["total_visitors"] or 0,
                    "total_fare": tot["total_fare"] or 0,
                    "prev_theater_count": p_data["theaters"] or 0,
                    "theater_change": (t_data["theaters"] or 0)
                    - (p_data["theaters"] or 0),
                }
            )

    results.sort(key=lambda x: x["total_fare"], reverse=True)
    return Response(results)


@api_view(["POST"])
def preview_score_upload(request):
    file = request.FILES.get("file")

    if not file:
        return Response({"error": "파일이 업로드되지 않았습니다."}, status=400)

    # ✅ 분기 처리는 이미 score_parsers.py의 handle_score_file_upload에 정의되어 있습니다.
    result = handle_score_file_upload(file)

    # 에러가 포함되어 있으면 400 에러 반환
    if "error" in result:
        return Response(result, status=400)

    # 성공 시 미리보기 데이터(data) 반환
    return Response(result, status=200)


@api_view(["POST"])
def confirm_score_save(request):
    data_list = request.data.get("data", [])
    count = save_confirmed_scores(data_list)
    return Response({"message": f"{count}건의 데이터가 저장되었습니다."}, status=200)
