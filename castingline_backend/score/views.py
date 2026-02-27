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


def get_movie_ids_for_primary(movie_id, format_movie_ids=None):
    """
    대표 영화 ID를 기준으로 관련 영화 ID들을 반환합니다.
    format_movie_ids가 제공되면 해당 서브영화 ID만 필터링하여 반환합니다.
    """
    try:
        primary = Movie.objects.get(id=movie_id, is_primary_movie=True)
    except Movie.DoesNotExist:
        return []

    base_code = primary.movie_code.strip()

    # 특정 포맷(서브영화)이 지정된 경우: 대표영화 + 지정된 서브영화만 반환
    if format_movie_ids:
        return [primary.id] + [int(fid) for fid in format_movie_ids if str(fid).isdigit()]

    # 전체 하위영화 반환 (기존 동작)
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

    # 포맷(서브영화) 필터
    format_ids_str = request.query_params.get("format_movie_ids", "")
    format_movie_ids = [x for x in format_ids_str.split(",") if x.strip()] if format_ids_str else None

    movie_ids = get_movie_ids_for_primary(movie_id, format_movie_ids=format_movie_ids)
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

    # 포맷(서브영화) 필터
    format_ids_str = request.query_params.get("format_movie_ids", "")
    format_movie_ids = [x for x in format_ids_str.split(",") if x.strip()] if format_ids_str else None

    movie_ids = get_movie_ids_for_primary(movie_id, format_movie_ids=format_movie_ids)
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
                   m.audio_mode, m.screening_type])
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


# ── 배급사(유저)별 연도별 영화 목록 API ──
@api_view(["GET"])
def movies_by_year(request):
    """
    GET /Api/score/movies-by-year/?year=2025
    로그인 유저의 배급사에 소속된, 해당 연도 개봉 대표 영화 목록을 반환합니다.
    superuser일 경우 전체 대표 영화를 반환합니다.
    """
    year = request.query_params.get("year")
    if not year:
        return Response({"error": "year 파라미터가 필요합니다."}, status=400)

    qs = Movie.objects.filter(
        release_date__year=year,
        is_primary_movie=True,
    ).order_by("-release_date")

    # 일반 유저(배급사 소속)일 경우 해당 배급사 영화만 필터링
    user = request.user
    if user.is_authenticated and not user.is_superuser and hasattr(user, 'client_id') and user.client_id:
        qs = qs.filter(distributor_id=user.client_id)

    result = []
    for m in qs.select_related("distributor"):
        result.append({
            "id": m.id,
            "title_ko": m.title_ko,
            "movie_code": m.movie_code,
            "release_date": str(m.release_date) if m.release_date else None,
            "distributor_name": m.distributor.client_name if m.distributor else None,
        })
    return Response(result)


# ── 대표 영화의 서브(포맷) 목록 API ──
@api_view(["GET"])
def movie_formats(request):
    """
    GET /Api/score/movie-formats/?movie_id=10
    대표 영화의 서브(포맷) 영화 목록을 반환합니다.
    viewing_dimension, screening_type 등을 조합하여 포맷 라벨을 생성합니다.
    """
    movie_id = request.query_params.get("movie_id")
    if not movie_id:
        return Response({"error": "movie_id 파라미터가 필요합니다."}, status=400)

    try:
        primary = Movie.objects.get(id=movie_id)
    except Movie.DoesNotExist:
        return Response({"error": "영화를 찾을 수 없습니다."}, status=404)

    base_code = primary.movie_code.strip()

    # 대표 영화를 부모로 둔 모든 서브(포맷) 영화 조회
    subs = Movie.objects.annotate(
        trimmed_code=Trim("primary_movie_code")
    ).filter(
        Q(trimmed_code=base_code)
    ).exclude(id=movie_id)

    result = []
    for s in subs:
        # 포맷 라벨 조립: viewing_dimension + screening_type + dx4_viewing_dimension
        parts = [s.viewing_dimension, s.screening_type, s.dx4_viewing_dimension, s.audio_mode]
        label = " ".join(p for p in parts if p and p.strip())
        result.append({
            "id": s.id,
            "label": label or s.title_ko,
            "movie_code": s.movie_code,
        })

    return Response(result)


# ── 엑셀 다운로드 API ──
@api_view(["GET"])
def score_summary_excel(request):
    """
    GET /Api/score/summary/excel/?movie_id=10&date=2025-01-01&region=...
    score_summary와 동일한 로직으로 데이터를 집계한 뒤 xlsx 파일로 반환합니다.
    """
    import openpyxl
    from django.http import HttpResponse

    # 기존 score_summary 로직을 재활용하여 데이터 생성
    # score_by_region을 직접 호출하고 Response 데이터를 파싱
    sort_by = request.query_params.get("sort_by", "region")
    movie_id = request.query_params.get("movie_id")

    if not movie_id:
        return Response({"error": "movie_id가 필요합니다."}, status=400)

    if sort_by == "multi":
        resp = score_by_multi(movie_id, request)
    elif sort_by == "version":
        resp = score_by_version(movie_id, request)
    else:
        resp = score_by_region(movie_id, request)

    data = resp.data if hasattr(resp, 'data') else []

    # 영화 정보 조회
    try:
        movie = Movie.objects.get(id=movie_id)
        movie_title = movie.title_ko
        release_date = movie.release_date.strftime("%Y-%m-%d") if movie.release_date else "-"
    except Movie.DoesNotExist:
        movie_title = "알 수 없는 영화"
        release_date = "-"

    # 엑셀 워크북 생성
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "스코어 종합"

    # 영화 정보 헤더
    ws.append([f"영화명: {movie_title}", f"개봉일: {release_date}"])
    ws.append([])

    # 테이블 헤더
    headers = ["구분", "극장수", "스크린수", "기준일 관객수(명)", "기준일 총요금(원)", "총 누계(명)", "총 요금(원)"]
    ws.append(headers)

    # 데이터 행
    totals = {"theaters": 0, "screens": 0, "base_visitors": 0, "base_fare": 0, "total_visitors": 0, "total_fare": 0}
    for row in data:
        section = row.get("section", "-")
        theaters = row.get("theater_count", 0) or 0
        screens = row.get("screen_count", 0) or 0
        base_visitors = row.get("base_day_visitors", 0) or 0
        base_fare = row.get("base_day_fare", 0) or 0
        total_visitors = row.get("total_visitors", 0) or 0
        total_fare = row.get("total_fare", 0) or 0

        ws.append([section, theaters, screens, base_visitors, base_fare, total_visitors, total_fare])

        totals["theaters"] += theaters
        totals["screens"] += screens
        totals["base_visitors"] += base_visitors
        totals["base_fare"] += base_fare
        totals["total_visitors"] += total_visitors
        totals["total_fare"] += total_fare

    # 합계 행
    ws.append(["합계", totals["theaters"], totals["screens"], totals["base_visitors"],
               totals["base_fare"], totals["total_visitors"], totals["total_fare"]])

    # HTTP Response로 반환
    response = HttpResponse(
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    safe_title = movie_title.replace(" ", "_")
    response["Content-Disposition"] = f'attachment; filename="score_{safe_title}.xlsx"'
    wb.save(response)
    return response


# ============================
#  기준별 현황 API (DB 집계 최적화)
# ============================
@api_view(["GET"])
def score_daily_status(request):
    """
    일현황 API
    GET /Api/score/daily/?movie_id=1&date_from=2025-03-19&date_to=2025-03-19
    집계단위: 날짜 + 극장 + 상영관 + 요금
    정렬: 날짜(오름차순) → 극장(가나다순) → 상영관(오름차순) → 요금(오름차순)
    """
    movie_id = request.query_params.get("movie_id")
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")

    if not movie_id or not date_from_str or not date_to_str:
        return Response({"error": "movie_id, date_from, date_to 필수"}, status=400)

    # 포맷(서브영화) 필터
    format_ids_str = request.query_params.get("format_movie_ids", "")
    format_movie_ids = [x for x in format_ids_str.split(",") if x.strip()] if format_ids_str else None
    movie_ids = get_movie_ids_for_primary(movie_id, format_movie_ids=format_movie_ids)

    if not movie_ids:
        return Response({"rows": [], "grand_total": {"visitor": 0, "revenue": 0}})

    # 대표영화 정보
    try:
        primary = Movie.objects.get(id=movie_id)
    except Movie.DoesNotExist:
        primary = None

    # 공통 필터
    common_filter = Q(
        movie_id__in=movie_ids,
        entry_date__gte=date_from_str,
        entry_date__lte=date_to_str,
    )
    region = request.query_params.get("region")
    multi = request.query_params.get("multi")
    theater_type = request.query_params.get("theater_type")
    if region and region != "전체":
        common_filter &= Q(client__region_code=region)
    if multi and multi != "전체":
        common_filter &= Q(client__theater_kind=multi)
    if theater_type and theater_type != "전체":
        common_filter &= Q(client__client_type=theater_type)

    # 집계: 날짜 + 극장 + 상영관 + 요금
    qs = list(
        Score.objects
        .filter(common_filter)
        .values("entry_date", "client_id", "auditorium", "fare")
        .annotate(total_visitor=Sum(Cast("visitor", IntegerField())))
    )

    if not qs:
        meta = {
            "movie_title": primary.title_ko if primary else "",
            "release_date": str(primary.release_date) if primary and primary.release_date else "",
        }
        return Response({"meta": meta, "rows": [], "grand_total": {"visitor": 0, "revenue": 0}})

    client_ids_set = list({row["client_id"] for row in qs})

    # 극장 기본 정보
    from client.models import Client, DistributorTheaterMap
    clients = {
        c["id"]: c for c in Client.objects.filter(id__in=client_ids_set).values(
            "id", "theater_name", "client_name", "excel_theater_name"
        )
    }

    # 배급사 극장명 조회 (로그인 유저가 배급사인 경우)
    theater_name_map = {}
    user = request.user
    if user.is_authenticated and not user.is_superuser and hasattr(user, 'client_id') and user.client_id:
        dist_maps = (
            DistributorTheaterMap.objects
            .filter(distributor_id=user.client_id, theater_id__in=client_ids_set)
            .order_by("theater_id", "-apply_date")
        )
        for m in dist_maps:
            if m.theater_id not in theater_name_map:
                theater_name_map[m.theater_id] = m.distributor_theater_name

    def get_theater_name(client_id):
        if client_id in theater_name_map:
            return theater_name_map[client_id]
        info = clients.get(client_id, {})
        return (
            info.get("excel_theater_name") or
            info.get("theater_name") or
            info.get("client_name") or
            ""
        )

    # 결과 조립
    rows = []
    total_visitor = 0
    total_revenue = 0

    for row in qs:
        try:
            fare_int = int(row["fare"] or 0)
        except (ValueError, TypeError):
            fare_int = 0
        visitor = row["total_visitor"] or 0
        revenue = fare_int * visitor
        theater = get_theater_name(row["client_id"])
        aud = row["auditorium"] or ""

        rows.append({
            "date": str(row["entry_date"]),
            "theater": theater,
            "auditorium": aud,
            "fare": row["fare"] or "",
            "visitor": visitor,
            "revenue": revenue,
            "_sort_date": str(row["entry_date"]),
            "_sort_theater": theater,
            "_sort_aud": aud,
            "_sort_fare": fare_int,
        })
        total_visitor += visitor
        total_revenue += revenue

    # 정렬: 날짜(오름차순) → 극장(가나다) → 상영관(오름차순) → 요금(오름차순)
    rows.sort(key=lambda r: (r["_sort_date"], r["_sort_theater"], r["_sort_aud"], r["_sort_fare"]))
    for r in rows:
        del r["_sort_date"]
        del r["_sort_theater"]
        del r["_sort_aud"]
        del r["_sort_fare"]

    meta = {
        "movie_title": primary.title_ko if primary else "",
        "release_date": str(primary.release_date) if primary and primary.release_date else "",
    }

    return Response({
        "meta": meta,
        "rows": rows,
        "grand_total": {
            "visitor": total_visitor,
            "revenue": total_revenue,
        },
    })


@api_view(["GET"])
def score_criteria(request):
    movie_id = request.query_params.get("movie_id")
    date_str = request.query_params.get("date")

    if not movie_id or not date_str:
        return Response({"error": "movie_id, date 필수"}, status=400)

    # 포맷(서브영화) 필터
    format_ids_str = request.query_params.get("format_movie_ids", "")
    format_movie_ids = [x for x in format_ids_str.split(",") if x.strip()] if format_ids_str else None
    movie_ids = get_movie_ids_for_primary(movie_id, format_movie_ids=format_movie_ids)

    if not movie_ids:
        return Response({"meta": None, "rows": []})

    base_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    prev_date = base_date - timedelta(days=1)
    prev_week_date = base_date - timedelta(days=7)

    # 대표영화 정보
    try:
        primary = Movie.objects.get(id=movie_id)
        release_date = primary.release_date
    except Movie.DoesNotExist:
        primary = None
        release_date = None

    # 서브영화 포맷명 매핑
    movie_format_map = {}
    for m in Movie.objects.filter(id__in=movie_ids):
        fmt = " ".join(filter(None, [m.viewing_dimension, m.audio_mode, m.screening_type,
                                      m.dx4_viewing_dimension, m.imax_l, m.screen_x])).strip()
        movie_format_map[m.id] = fmt or m.title_ko

    # ── 공통 필터를 적용한 base queryset ──
    common_filter = Q(movie_id__in=movie_ids)
    region = request.query_params.get("region")
    multi = request.query_params.get("multi")
    theater_type = request.query_params.get("theater_type")
    if region and region != "전체":
        common_filter &= Q(client__region_code=region)
    if multi and multi != "전체":
        common_filter &= Q(client__theater_kind=multi)
    if theater_type and theater_type != "전체":
        common_filter &= Q(client__client_type=theater_type)

    GROUP_FIELDS = ["client_id", "auditorium", "movie_id", "fare"]

    def _aggregate(extra_filter):
        """DB 레벨 집계: (client, auditorium, movie, fare, show_count) → sum(visitor)"""
        return (
            Score.objects
            .filter(common_filter & extra_filter)
            .values(*GROUP_FIELDS, "show_count")
            .annotate(total=Sum(Cast("visitor", IntegerField())))
        )

    def _aggregate_total(extra_filter):
        """DB 레벨 집계: (client, auditorium, movie, fare) → sum(visitor) (회차 무관)"""
        return (
            Score.objects
            .filter(common_filter & extra_filter)
            .values(*GROUP_FIELDS)
            .annotate(total=Sum(Cast("visitor", IntegerField())))
        )

    # ── 1. 기준일 회차별 데이터 ──
    base_data = defaultdict(lambda: defaultdict(int))
    client_ids_set = set()

    for row in _aggregate(Q(entry_date=base_date)):
        mid = row["movie_id"]
        fmt = movie_format_map.get(mid, "")
        key = (row["client_id"], row["auditorium"] or "", fmt, row["fare"] or "")
        try:
            sc = int(row["show_count"]) if row["show_count"] else 0
        except (ValueError, TypeError):
            sc = 0
        base_data[key][sc] += row["total"] or 0
        client_ids_set.add(row["client_id"])

    if not base_data:
        meta = {
            "movie_title": primary.title_ko if primary else "",
            "release_date": str(release_date) if release_date else "",
            "base_date": date_str,
        }
        return Response({"meta": meta, "rows": []})

    # ── 2. 전일/전주일/누계: 합계만 (회차 구분 없이) ──
    prev_totals = {}
    for row in _aggregate_total(Q(entry_date=prev_date)):
        fmt = movie_format_map.get(row["movie_id"], "")
        key = (row["client_id"], row["auditorium"] or "", fmt, row["fare"] or "")
        prev_totals[key] = prev_totals.get(key, 0) + (row["total"] or 0)

    prev_week_totals = {}
    for row in _aggregate_total(Q(entry_date=prev_week_date)):
        fmt = movie_format_map.get(row["movie_id"], "")
        key = (row["client_id"], row["auditorium"] or "", fmt, row["fare"] or "")
        prev_week_totals[key] = prev_week_totals.get(key, 0) + (row["total"] or 0)

    cumul_filter = Q(entry_date__lte=base_date)
    if release_date:
        cumul_filter &= Q(entry_date__gte=release_date)
    cumul_totals = {}
    for row in _aggregate_total(cumul_filter):
        fmt = movie_format_map.get(row["movie_id"], "")
        key = (row["client_id"], row["auditorium"] or "", fmt, row["fare"] or "")
        cumul_totals[key] = cumul_totals.get(key, 0) + (row["total"] or 0)

    # ── 3. 거래처 정보 일괄 조회 ──
    from client.models import Client
    clients = Client.objects.filter(id__in=client_ids_set).values(
        "id", "theater_name", "client_name", "region_code", "theater_kind", "classification"
    )
    client_info = {}
    for c in clients:
        client_info[c["id"]] = {
            "theater": c["theater_name"] or c["client_name"] or "",
            "region": c["region_code"] or "",
            "multi": c["theater_kind"] or "",
            "classification": c["classification"] or "",
        }

    # ── 4. 결과 조립 ──
    sorted_keys = sorted(base_data.keys(), key=lambda k: (
        client_info.get(k[0], {}).get("region", ""),
        client_info.get(k[0], {}).get("multi", ""),
        client_info.get(k[0], {}).get("theater", ""),
        k[1], k[2], k[3],
    ))

    rows = []
    for key in sorted_keys:
        cid, aud, fmt, fare = key
        info = client_info.get(cid, {})
        sessions = base_data[key]
        s_list = [sessions.get(i, 0) for i in range(1, 13)]
        daily_total = sum(s_list)

        rows.append({
            "type": "data",
            "client_id": cid,
            "theater": info.get("theater", ""),
            "auditorium": aud,
            "format": fmt,
            "region": info.get("region", ""),
            "multi": info.get("multi", ""),
            "classification": info.get("classification", ""),
            "fare": fare,
            "sessions": s_list,
            "daily_total": daily_total,
            "prev_day": prev_totals.get(key, 0),
            "prev_week": prev_week_totals.get(key, 0),
            "cumulative": cumul_totals.get(key, 0),
        })

    meta = {
        "movie_title": primary.title_ko if primary else "",
        "release_date": str(release_date) if release_date else "",
        "base_date": date_str,
    }

    return Response({"meta": meta, "rows": rows})


# ============================
#  좌석판매율 현황 API
# ============================
MULTI_ORDER = {"CGV": 0, "롯데": 1, "메가박스": 2, "씨네큐": 3, "기타": 4}
MULTI_LIST = ["CGV", "롯데", "메가박스", "씨네큐", "기타"]
REGIONS = ["서울", "경강", "경남", "경북", "충청", "호남"]


def _normalize_multi(theater_kind, is_car_theater):
    """theater_kind → 통합 멀티 분류 (기타/자동차극장 포함)"""
    if is_car_theater:
        return "기타"
    if theater_kind in ("CGV", "롯데", "메가박스", "씨네큐"):
        return theater_kind
    return "기타"


@api_view(["GET"])
def score_seat_rate(request):
    """
    좌석판매율 현황 API
    GET /Api/score/seat-rate/?movie_id=1&date=2025-02-11
    집계단위: 날짜 + 극장 (특정 날짜 단일)
    """
    movie_id = request.query_params.get("movie_id")
    date_str = request.query_params.get("date")

    if not movie_id or not date_str:
        return Response({"error": "movie_id, date 필수"}, status=400)

    # 포맷(서브영화) 필터
    format_ids_str = request.query_params.get("format_movie_ids", "")
    format_movie_ids = [x for x in format_ids_str.split(",") if x.strip()] if format_ids_str else None
    movie_ids = get_movie_ids_for_primary(movie_id, format_movie_ids=format_movie_ids)

    if not movie_ids:
        return Response({"meta": {}, "summary": [], "detail": []})

    # 대표영화 정보
    try:
        primary = Movie.objects.get(id=movie_id)
    except Movie.DoesNotExist:
        primary = None

    # ── 1. Score 집계: (client_id, auditorium, show_count, fare) → sum(visitor) ──
    qs = list(
        Score.objects
        .filter(movie_id__in=movie_ids, entry_date=date_str)
        .values("client_id", "auditorium", "show_count", "fare")
        .annotate(total_visitor=Sum(Cast("visitor", IntegerField())))
    )

    if not qs:
        meta = {
            "movie_title": primary.title_ko if primary else "",
            "release_date": str(primary.release_date) if primary and primary.release_date else "",
            "date": date_str,
        }
        return Response({"meta": meta, "summary": [], "detail": []})

    client_ids_set = list({row["client_id"] for row in qs})

    # ── 2. Theater 좌석수 조회 ──
    from client.models import Client, Theater, DistributorTheaterMap
    theater_seat_map = {}
    for t in Theater.objects.filter(client_id__in=client_ids_set).values("client_id", "auditorium", "seat_count"):
        key = (t["client_id"], t["auditorium"] or "")
        try:
            theater_seat_map[key] = int(t["seat_count"] or 0)
        except (ValueError, TypeError):
            theater_seat_map[key] = 0

    # ── 3. Client(극장) 정보 조회 ──
    clients = {
        c["id"]: c for c in Client.objects.filter(id__in=client_ids_set).values(
            "id", "theater_name", "client_name", "excel_theater_name",
            "region_code", "theater_kind", "classification", "is_car_theater"
        )
    }

    # 배급사 극장명 매핑 (배급사 로그인 시)
    theater_name_map = {}
    user = request.user
    if user.is_authenticated and not user.is_superuser and hasattr(user, 'client_id') and user.client_id:
        dist_maps = (
            DistributorTheaterMap.objects
            .filter(distributor_id=user.client_id, theater_id__in=client_ids_set)
            .order_by("theater_id", "-apply_date")
        )
        for m in dist_maps:
            if m.theater_id not in theater_name_map:
                theater_name_map[m.theater_id] = m.distributor_theater_name

    def get_theater_name(cid):
        if cid in theater_name_map:
            return theater_name_map[cid]
        info = clients.get(cid, {})
        return (
            info.get("excel_theater_name") or
            info.get("theater_name") or
            info.get("client_name") or
            ""
        )

    # ── 4. (관별×회차별) 집계: 관객수·매출액 계산 ──
    # aud_show_map: {(client_id, auditorium, show_count): {visitor, revenue}}
    aud_show_data = defaultdict(lambda: {"visitor": 0, "revenue": 0})

    for row in qs:
        cid = row["client_id"]
        aud = row["auditorium"] or ""
        sc = row["show_count"] or ""
        try:
            fare_int = int(row["fare"] or 0)
        except (ValueError, TypeError):
            fare_int = 0
        visitor = row["total_visitor"] or 0
        revenue = fare_int * visitor
        key = (cid, aud, sc)
        aud_show_data[key]["visitor"] += visitor
        aud_show_data[key]["revenue"] += revenue

    # ── 5. 극장별 집계 ──
    # 좌석수: 관객 1명 이상 발생한 회차의 (관 좌석수 × 해당 회차 수)
    theater_data = defaultdict(lambda: {"visitor": 0, "revenue": 0, "seat_capacity": 0, "show_count": 0})

    # (client_id, auditorium) 단위로 active show 집계
    aud_active = defaultdict(lambda: {"active_shows": 0, "visitor": 0, "revenue": 0})
    for (cid, aud, sc), data in aud_show_data.items():
        aud_active[(cid, aud)]["visitor"] += data["visitor"]
        aud_active[(cid, aud)]["revenue"] += data["revenue"]
        if data["visitor"] > 0:
            aud_active[(cid, aud)]["active_shows"] += 1

    for (cid, aud), agg in aud_active.items():
        seat_count = theater_seat_map.get((cid, aud), 0)
        active_shows = agg["active_shows"]
        seat_capacity = seat_count * active_shows

        theater_data[cid]["visitor"] += agg["visitor"]
        theater_data[cid]["revenue"] += agg["revenue"]
        theater_data[cid]["seat_capacity"] += seat_capacity
        theater_data[cid]["show_count"] += active_shows

    # ── 6. 상세 데이터 구성 ──
    detail_rows = []
    for cid, data in theater_data.items():
        info = clients.get(cid, {})
        visitor = data["visitor"]
        seat_capacity = data["seat_capacity"]
        revenue = data["revenue"]
        show_count_val = data["show_count"]
        seat_rate = round(visitor / seat_capacity * 100, 1) if seat_capacity > 0 else 0.0
        multi = _normalize_multi(info.get("theater_kind") or "", info.get("is_car_theater") or False)

        detail_rows.append({
            "client_id": cid,
            "multi": multi,
            "multi_order": MULTI_ORDER.get(multi, 4),
            "region": info.get("region_code") or "",
            "classification": info.get("classification") or "",
            "theater": get_theater_name(cid),
            "date": date_str,
            "visitor": visitor,
            "revenue": revenue,
            "show_count": show_count_val,
            "seat_count": seat_capacity,
            "seat_rate": seat_rate,
        })

    # ── 7. 정렬: 멀티순 → 좌석판매율 내림차순 → 극장명 오름차순 ──
    detail_rows.sort(key=lambda r: (r["multi_order"], -r["seat_rate"], r["theater"]))

    # ── 8. 멀티별 순위 부여 ──
    multi_rank_counter = defaultdict(int)
    for row in detail_rows:
        multi_rank_counter[row["multi"]] += 1
        row["rank"] = multi_rank_counter[row["multi"]]
        del row["multi_order"]
        del row["client_id"]

    # ── 9. 요약 데이터 (멀티별 합계 + 지역별 좌판율) ──
    multi_agg = {
        m: {
            "visitor": 0,
            "seat_capacity": 0,
            "regions": {r: {"visitor": 0, "seat_capacity": 0} for r in REGIONS}
        }
        for m in MULTI_LIST
    }

    for cid, data in theater_data.items():
        info = clients.get(cid, {})
        multi = _normalize_multi(info.get("theater_kind") or "", info.get("is_car_theater") or False)
        region = info.get("region_code") or ""
        target = multi_agg.get(multi, multi_agg["기타"])
        target["visitor"] += data["visitor"]
        target["seat_capacity"] += data["seat_capacity"]
        if region in REGIONS:
            target["regions"][region]["visitor"] += data["visitor"]
            target["regions"][region]["seat_capacity"] += data["seat_capacity"]

    summary = []
    total_visitor = 0
    total_seat_capacity = 0
    total_regions = {r: {"visitor": 0, "seat_capacity": 0} for r in REGIONS}

    for multi in MULTI_LIST:
        agg = multi_agg[multi]
        if agg["visitor"] == 0 and agg["seat_capacity"] == 0:
            continue
        visitor = agg["visitor"]
        seat_capacity = agg["seat_capacity"]
        seat_rate = round(visitor / seat_capacity * 100, 1) if seat_capacity > 0 else 0.0

        region_rates = {}
        for r in REGIONS:
            rv = agg["regions"][r]["visitor"]
            rs = agg["regions"][r]["seat_capacity"]
            region_rates[r] = round(rv / rs * 100, 1) if rs > 0 else None
            total_regions[r]["visitor"] += rv
            total_regions[r]["seat_capacity"] += rs

        summary.append({
            "multi": multi,
            "visitor": visitor,
            "seat_count": seat_capacity,
            "seat_rate": seat_rate,
            "regions": region_rates,
        })
        total_visitor += visitor
        total_seat_capacity += seat_capacity

    total_seat_rate = round(total_visitor / total_seat_capacity * 100, 1) if total_seat_capacity > 0 else 0.0
    total_region_rates = {}
    for r in REGIONS:
        rv = total_regions[r]["visitor"]
        rs = total_regions[r]["seat_capacity"]
        total_region_rates[r] = round(rv / rs * 100, 1) if rs > 0 else None

    summary.append({
        "multi": "합계",
        "visitor": total_visitor,
        "seat_count": total_seat_capacity,
        "seat_rate": total_seat_rate,
        "regions": total_region_rates,
    })

    meta = {
        "movie_title": primary.title_ko if primary else "",
        "release_date": str(primary.release_date) if primary and primary.release_date else "",
        "date": date_str,
    }

    return Response({"meta": meta, "summary": summary, "detail": detail_rows})


# ============================
#  누계 순위 API
# ============================
@api_view(["GET"])
def score_ranking(request):
    """
    누계 순위 API
    GET /Api/score/ranking/?movie_id=1&date_from=2025-01-01&date_to=2025-03-19
    집계단위: 극장 (date_from~date_to 누적)
    정렬: 누적 관객수 내림차순 (기본) | 누적 매출액 내림차순 (sort_by=revenue)
    """
    movie_id = request.query_params.get("movie_id")
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")

    if not movie_id or not date_from_str or not date_to_str:
        return Response({"error": "movie_id, date_from, date_to 필수"}, status=400)

    # 포맷(서브영화) 필터
    format_ids_str = request.query_params.get("format_movie_ids", "")
    format_movie_ids = [x for x in format_ids_str.split(",") if x.strip()] if format_ids_str else None
    movie_ids = get_movie_ids_for_primary(movie_id, format_movie_ids=format_movie_ids)

    if not movie_ids:
        return Response({"meta": {}, "rows": []})

    # 대표영화 정보
    try:
        primary = Movie.objects.get(id=movie_id)
    except Movie.DoesNotExist:
        primary = None

    # 공통 필터
    common_filter = Q(
        movie_id__in=movie_ids,
        entry_date__gte=date_from_str,
        entry_date__lte=date_to_str,
    )
    region = request.query_params.get("region")
    multi = request.query_params.get("multi")
    theater_type = request.query_params.get("theater_type")
    if region and region != "전체":
        common_filter &= Q(client__region_code=region)
    if multi and multi != "전체":
        common_filter &= Q(client__theater_kind=multi)
    if theater_type and theater_type != "전체":
        common_filter &= Q(client__client_type=theater_type)

    # 집계: (client_id, fare, entry_date) → sum(visitor)
    qs = list(
        Score.objects
        .filter(common_filter)
        .values("client_id", "fare", "entry_date")
        .annotate(total_visitor=Sum(Cast("visitor", IntegerField())))
    )

    if not qs:
        meta = {
            "movie_title": primary.title_ko if primary else "",
            "release_date": str(primary.release_date) if primary and primary.release_date else "",
            "date_from": date_from_str,
            "date_to": date_to_str,
        }
        return Response({"meta": meta, "rows": []})

    client_ids_set = list({row["client_id"] for row in qs})

    # 극장 정보 조회
    from client.models import Client, DistributorTheaterMap
    clients = {
        c["id"]: c for c in Client.objects.filter(id__in=client_ids_set).values(
            "id", "theater_name", "client_name", "excel_theater_name"
        )
    }

    # 배급사 극장명 매핑
    theater_name_map = {}
    user = request.user
    if user.is_authenticated and not user.is_superuser and hasattr(user, 'client_id') and user.client_id:
        dist_maps = (
            DistributorTheaterMap.objects
            .filter(distributor_id=user.client_id, theater_id__in=client_ids_set)
            .order_by("theater_id", "-apply_date")
        )
        for m in dist_maps:
            if m.theater_id not in theater_name_map:
                theater_name_map[m.theater_id] = m.distributor_theater_name

    def get_theater_name(cid):
        if cid in theater_name_map:
            return theater_name_map[cid]
        info = clients.get(cid, {})
        return (
            info.get("excel_theater_name") or
            info.get("theater_name") or
            info.get("client_name") or
            ""
        )

    # 극장별 Python 집계 (min_date, max_date 포함)
    theater_agg = defaultdict(lambda: {
        "visitor": 0,
        "revenue": 0,
        "min_date": None,
        "max_date": None,
    })

    for row in qs:
        cid = row["client_id"]
        try:
            fare_int = int(row["fare"] or 0)
        except (ValueError, TypeError):
            fare_int = 0
        visitor = row["total_visitor"] or 0
        revenue = fare_int * visitor
        entry_date = row["entry_date"]

        theater_agg[cid]["visitor"] += visitor
        theater_agg[cid]["revenue"] += revenue

        if theater_agg[cid]["min_date"] is None or entry_date < theater_agg[cid]["min_date"]:
            theater_agg[cid]["min_date"] = entry_date
        if theater_agg[cid]["max_date"] is None or entry_date > theater_agg[cid]["max_date"]:
            theater_agg[cid]["max_date"] = entry_date

    # 결과 조립
    sort_by = request.query_params.get("sort_by", "visitor")
    rows = []
    for cid, data in theater_agg.items():
        min_d = str(data["min_date"]) if data["min_date"] else ""
        max_d = str(data["max_date"]) if data["max_date"] else ""
        rows.append({
            "theater": get_theater_name(cid),
            "visitor": data["visitor"],
            "revenue": data["revenue"],
            "min_date": min_d,
            "max_date": max_d,
        })

    # 정렬
    if sort_by == "revenue":
        rows.sort(key=lambda r: -r["revenue"])
    else:
        rows.sort(key=lambda r: -r["visitor"])

    meta = {
        "movie_title": primary.title_ko if primary else "",
        "release_date": str(primary.release_date) if primary and primary.release_date else "",
        "date_from": date_from_str,
        "date_to": date_to_str,
    }

    return Response({"meta": meta, "rows": rows})


# ── 집계작 시간표 날짜 목록 API ──
@api_view(["GET"])
def score_timetable_dates(request):
    """
    GET /Api/score/timetable/dates/?movie_id=1
    해당 영화의 크롤링 시간표 데이터가 존재하는 날짜 목록을 반환합니다.
    """
    import re
    from crawler.models import MovieSchedule

    movie_id = request.query_params.get("movie_id")
    if not movie_id:
        return Response({"error": "movie_id가 필요합니다."}, status=400)

    try:
        movie = Movie.objects.get(id=movie_id)
    except Movie.DoesNotExist:
        return Response({"error": "영화를 찾을 수 없습니다."}, status=404)

    def normalize_str(s):
        return re.sub(r'[^a-zA-Z0-9가-힣]', '', s).lower()

    clean_target = normalize_str(movie.title_ko)

    # 1) 중복 없는 movie_title 목록에서 매칭되는 제목만 필터
    all_titles = list(MovieSchedule.objects.values_list('movie_title', flat=True).distinct())
    matched_titles = [t for t in all_titles if clean_target in normalize_str(t)]

    if not matched_titles:
        return Response({"dates": []})

    # 2) 매칭된 제목의 play_date 목록 반환
    dates = list(
        MovieSchedule.objects.filter(
            movie_title__in=matched_titles,
            play_date__isnull=False
        ).values_list('play_date', flat=True).distinct().order_by('play_date')
    )
    return Response({"dates": [d.strftime("%Y-%m-%d") for d in dates]})


# ── 집계작 시간표 집계 API ──
@api_view(["GET"])
def score_timetable(request):
    """
    GET /Api/score/timetable/?movie_id=1&date_from=2026-01-01&date_to=2026-01-31
    집계작 시간표 데이터를 계열사별/지역별/포맷별/시간대별로 집계하여 반환합니다.
    """
    import re
    from crawler.models import MovieSchedule
    from client.models import Client

    movie_id = request.query_params.get("movie_id")
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")

    if not movie_id or not date_from_str or not date_to_str:
        return Response({"error": "movie_id, date_from, date_to가 필요합니다."}, status=400)

    try:
        movie = Movie.objects.select_related("distributor").get(id=movie_id)
    except Movie.DoesNotExist:
        return Response({"error": "영화를 찾을 수 없습니다."}, status=404)

    try:
        d_from = datetime.strptime(date_from_str, "%Y-%m-%d").date()
        d_to = datetime.strptime(date_to_str, "%Y-%m-%d").date()
    except ValueError:
        return Response({"error": "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)"}, status=400)

    def normalize_str(s):
        return re.sub(r'[^a-zA-Z0-9가-힣]', '', s).lower()

    clean_target = normalize_str(movie.title_ko)

    # 매칭 제목 목록 추출
    all_titles = list(MovieSchedule.objects.values_list('movie_title', flat=True).distinct())
    matched_titles = [t for t in all_titles if clean_target in normalize_str(t)]

    if not matched_titles:
        return Response({
            "meta": {
                "movie_title": movie.title_ko,
                "release_date": str(movie.release_date) if movie.release_date else None,
                "distributor_name": movie.distributor.client_name if movie.distributor else None,
            },
            "by_chain": [], "by_region": [], "by_format": [],
            "time_slots": {"count_rows": [], "pct_rows": []},
            "daily_chart": [],
        })

    # 데이터 조회
    schedules = list(
        MovieSchedule.objects.filter(
            movie_title__in=matched_titles,
            play_date__gte=d_from,
            play_date__lte=d_to,
        ).values(
            'brand', 'theater_name', 'screen_name',
            'start_time', 'play_date', 'total_seats', 'remaining_seats', 'tags'
        )
    )

    # 지역/구분 매핑 테이블 구성 (Client 모델 기반)
    clients = list(Client.objects.values(
        'theater_kind', 'excel_theater_name', 'theater_name',
        'region_code', 'classification'
    ))

    region_map = {}
    classif_map = {}

    def norm_brand(kind):
        if not kind: return None
        k = kind.upper()
        if 'CGV' in k: return 'CGV'
        if 'LOTTE' in k or '롯데' in k: return 'LOTTE'
        if 'MEGA' in k or '메가' in k: return 'MEGABOX'
        return None

    for c in clients:
        b = norm_brand(c['theater_kind'])
        if not b: continue
        region = c['region_code']
        cls = c['classification'] or '-'
        for field in ('excel_theater_name', 'theater_name'):
            name = c.get(field)
            if name:
                key = (b, name.replace(' ', ''))
                if region:
                    region_map[key] = region
                classif_map[key] = cls

    def strip_prefix(s):
        return (s.replace("CGV", "").replace("롯데시네마", "").replace("롯데", "")
                  .replace("메가박스", "").replace("씨네큐", "").replace(" ", ""))

    def get_client_info(brand, theater):
        clean = theater.replace(" ", "")
        r = region_map.get((brand, clean))
        cl = classif_map.get((brand, clean))
        if r and cl:
            return r, cl
        crawl_pure = strip_prefix(theater)
        for (mb, mn), mr in region_map.items():
            if mb != brand: continue
            cp = strip_prefix(mn)
            if crawl_pure == cp or (len(cp) >= 2 and len(crawl_pure) >= 2 and
                                    (cp in crawl_pure or crawl_pure in cp)):
                return mr, classif_map.get((mb, mn), '-')
        return '기타', '-'

    def get_format(tags):
        for t in (tags or []):
            tu = str(t).upper()
            if "IMAX" in tu: return "IMAX"
            if "4DX" in tu: return "4DX"
            if "SCREENX" in tu or "SCREEN X" in tu: return "SCREENX"
            if "DOLBY" in tu or "ATMOS" in tu: return "DOLBY"
        return "일반"

    def get_slot(start_time):
        m = start_time.hour * 60 + start_time.minute
        if 300 <= m <= 600: return "조조"
        if 601 <= m <= 720: return "오전"
        if 721 <= m <= 1020: return "오후"
        if 1021 <= m <= 1260: return "저녁"
        if 1261 <= m <= 1439: return "심야"
        return None

    BRAND_DISPLAY = {'CGV': 'CGV', 'LOTTE': '롯데', 'MEGABOX': '메가박스', 'OTHER': '일반'}
    CHAIN_ORDER = ['CGV', '롯데', '메가박스', '일반']
    REGION_ORDER = ['서울', '경강', '경남', '경북', '충청', '호남']
    SLOT_NAMES = ["조조", "오전", "오후", "저녁", "심야"]

    def empty_agg():
        return {'theaters': set(), 'screens': set(), 'shows': 0, 'total_seats': 0, 'sold_seats': 0}

    chain_agg = defaultdict(empty_agg)
    region_agg = defaultdict(empty_agg)
    format_agg = defaultdict(empty_agg)
    slot_agg = defaultdict(lambda: defaultdict(int))
    daily_agg = defaultdict(int)

    for s in schedules:
        brand = s['brand']
        bd = BRAND_DISPLAY.get(brand, brand)
        theater = s['theater_name']
        screen = s['screen_name']
        ts = s['total_seats'] or 0
        rem = s['remaining_seats'] or 0
        sold = max(0, ts - rem)
        tags = s['tags'] or []
        fmt = get_format(tags)
        region, cls = get_client_info(brand, theater)
        play_date = s['play_date']
        start_time = s['start_time']

        # 계열사별
        chain_agg[bd]['theaters'].add(theater)
        chain_agg[bd]['screens'].add((theater, screen))
        chain_agg[bd]['shows'] += 1
        chain_agg[bd]['total_seats'] += ts
        chain_agg[bd]['sold_seats'] += sold

        # 지역별
        region_agg[region]['theaters'].add((brand, theater))
        region_agg[region]['screens'].add((brand, theater, screen))
        region_agg[region]['shows'] += 1
        region_agg[region]['total_seats'] += ts
        region_agg[region]['sold_seats'] += sold

        # 포맷별 (계열사+포맷+구분)
        fk = (bd, fmt, cls)
        format_agg[fk]['theaters'].add(theater)
        format_agg[fk]['screens'].add((theater, screen))
        format_agg[fk]['shows'] += 1
        format_agg[fk]['total_seats'] += ts
        format_agg[fk]['sold_seats'] += sold

        # 시간대별
        if start_time:
            slot = get_slot(start_time)
            if slot:
                slot_agg[bd][slot] += 1

        # 일별 차트
        if play_date:
            ds = play_date.strftime("%Y-%m-%d") if hasattr(play_date, 'strftime') else str(play_date)
            daily_agg[ds] += ts

    def make_row(label, d):
        tc = len(d['theaters'])
        sc = len(d['screens'])
        sh = d['shows']
        tot = d['total_seats']
        sold = d['sold_seats']
        return {
            "label": label,
            "theater_count": tc,
            "show_count": sh,
            "avg_shows": round(sh / tc, 1) if tc > 0 else 0,
            "screen_count": sc,
            "total_seats": tot,
            "avg_seats": round(tot / sh, 1) if sh > 0 else 0,
            "sold_seats": sold,
        }

    def total_of(dicts):
        t = empty_agg()
        for d in dicts:
            t['theaters'].update(d['theaters'])
            t['screens'].update(d['screens'])
            t['shows'] += d['shows']
            t['total_seats'] += d['total_seats']
            t['sold_seats'] += d['sold_seats']
        return t

    # 계열사별
    by_chain = []
    included_c = []
    for ch in CHAIN_ORDER:
        if ch in chain_agg:
            by_chain.append(make_row(ch, chain_agg[ch]))
            included_c.append(chain_agg[ch])
    if by_chain:
        by_chain.append({**make_row("합계", total_of(included_c)), "is_total": True})

    # 지역별
    by_region = []
    included_r = []
    for rg in REGION_ORDER:
        if rg in region_agg:
            by_region.append(make_row(rg, region_agg[rg]))
            included_r.append(region_agg[rg])
    if '기타' in region_agg:
        by_region.append(make_row('기타', region_agg['기타']))
        included_r.append(region_agg['기타'])
    if by_region:
        by_region.append({**make_row("합계", total_of(included_r)), "is_total": True})

    # 포맷별
    by_format = []
    included_f = []
    fkeys = sorted(format_agg.keys(),
                   key=lambda x: (CHAIN_ORDER.index(x[0]) if x[0] in CHAIN_ORDER else 99, x[1], x[2]))
    for (bd, fmt, cls) in fkeys:
        d = format_agg[(bd, fmt, cls)]
        row = make_row(bd, d)
        row['format'] = fmt
        row['classification'] = cls
        by_format.append(row)
        included_f.append(d)
    if by_format:
        tr = make_row("합계", total_of(included_f))
        tr['format'] = ""
        tr['classification'] = ""
        tr['is_total'] = True
        by_format.append(tr)

    # 시간대별
    count_rows = []
    pct_rows = []
    grand_shows = 0
    total_slots = defaultdict(int)
    for ch in CHAIN_ORDER:
        if ch not in slot_agg: continue
        slots = slot_agg[ch]
        ch_total = sum(slots.get(s, 0) for s in SLOT_NAMES)
        if ch_total == 0: continue
        grand_shows += ch_total
        cr = {"label": ch, "total": ch_total}
        pr = {"label": ch}
        for sl in SLOT_NAMES:
            cnt = slots.get(sl, 0)
            cr[sl] = cnt
            pr[sl] = round(cnt / ch_total * 100, 1) if ch_total > 0 else 0.0
            total_slots[sl] += cnt
        count_rows.append(cr)
        pct_rows.append(pr)
    if count_rows:
        tcr = {"label": "합계", "total": grand_shows, "is_total": True}
        tpr = {"label": "합계", "is_total": True}
        for sl in SLOT_NAMES:
            cnt = total_slots[sl]
            tcr[sl] = cnt
            tpr[sl] = round(cnt / grand_shows * 100, 1) if grand_shows > 0 else 0.0
        count_rows.append(tcr)
        pct_rows.append(tpr)

    daily_chart = [{"date": d, "total_seats": v} for d, v in sorted(daily_agg.items())]

    return Response({
        "meta": {
            "movie_title": movie.title_ko,
            "release_date": str(movie.release_date) if movie.release_date else None,
            "distributor_name": movie.distributor.client_name if movie.distributor else None,
        },
        "by_chain": by_chain,
        "by_region": by_region,
        "by_format": by_format,
        "time_slots": {"count_rows": count_rows, "pct_rows": pct_rows},
        "daily_chart": daily_chart,
    })


# ============================
#  상세 부금 조회 API (배급사용)
# ============================
@api_view(["GET"])
def score_settlement_detail(request):
    """
    상세 부금 조회 API (배급사용)
    GET /Api/score/settlement/?movie_id=1&date_from=2025-01-01&date_to=2025-01-31
    집계단위: (극장, 부율, 기금면제여부) 그룹
    """
    from decimal import Decimal, ROUND_HALF_UP
    from fund.models import DailyFund, MonthlyFund, Fund as FundModel
    from rate.models import Rate, TheaterRate, DefaultRate
    from client.models import Client, DistributorTheaterMap

    movie_id = request.query_params.get("movie_id")
    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")

    if not movie_id or not date_from_str or not date_to_str:
        return Response({"error": "movie_id, date_from, date_to 필수"}, status=400)

    # 포맷 필터
    format_ids_str = request.query_params.get("format_movie_ids", "")
    format_movie_ids_list = [x for x in format_ids_str.split(",") if x.strip()] if format_ids_str else None
    movie_ids = get_movie_ids_for_primary(movie_id, format_movie_ids=format_movie_ids_list)

    if not movie_ids:
        return Response({"meta": {}, "rows": []})

    # 포맷 라벨 결정
    if format_movie_ids_list:
        fmt_movies = Movie.objects.filter(id__in=[int(x) for x in format_movie_ids_list if x.isdigit()])
        labels = []
        for m in fmt_movies:
            parts = [m.viewing_dimension, m.screening_type, m.dx4_viewing_dimension, m.audio_mode]
            lbl = " ".join(p for p in parts if p and p.strip()) or m.title_ko
            labels.append(lbl)
        format_display = " / ".join(labels) if labels else "전체"
    else:
        format_display = "전체"

    try:
        primary = Movie.objects.get(id=movie_id)
    except Movie.DoesNotExist:
        primary = None

    date_from_obj = datetime.strptime(date_from_str, "%Y-%m-%d").date()
    date_to_obj = datetime.strptime(date_to_str, "%Y-%m-%d").date()

    # 공통 필터
    common_filter = Q(
        movie_id__in=movie_ids,
        entry_date__gte=date_from_obj,
        entry_date__lte=date_to_obj,
    )
    region = request.query_params.get("region")
    multi_p = request.query_params.get("multi")
    theater_type = request.query_params.get("theater_type")
    if region and region != "전체":
        common_filter &= Q(client__region_code=region)
    if multi_p and multi_p != "전체":
        common_filter &= Q(client__theater_kind=multi_p)
    if theater_type and theater_type != "전체":
        common_filter &= Q(client__client_type=theater_type)

    # DB 집계: (client_id, fare, entry_date, auditorium) → sum(visitor)
    qs = list(
        Score.objects
        .filter(common_filter)
        .values("client_id", "fare", "entry_date", "auditorium")
        .annotate(total_visitor=Sum(Cast("visitor", IntegerField())))
        .order_by("entry_date")
    )

    if not qs:
        meta = {
            "movie_title": primary.title_ko if primary else "",
            "release_date": str(primary.release_date) if primary and primary.release_date else "",
            "date_from": date_from_str,
            "date_to": date_to_str,
        }
        return Response({"meta": meta, "rows": []})

    client_ids_set = list({r["client_id"] for r in qs})
    from_year = date_from_obj.year
    to_year = date_to_obj.year

    # 기금 맵 (daily → monthly → yearly 우선순위)
    daily_fund_map = {
        (f.client_id, f.yyyy, f.mm, f.dd): f.fund_yn
        for f in DailyFund.objects.filter(client_id__in=client_ids_set, yyyy__gte=from_year, yyyy__lte=to_year)
    }
    monthly_fund_map = {
        (f.client_id, f.yyyy, f.mm): f.fund_yn
        for f in MonthlyFund.objects.filter(client_id__in=client_ids_set, yyyy__gte=from_year, yyyy__lte=to_year)
    }
    yearly_fund_map = {
        (f.client_id, f.yyyy): f.fund_yn
        for f in FundModel.objects.filter(client_id__in=client_ids_set, yyyy__gte=from_year, yyyy__lte=to_year)
    }

    def get_fund_exempt(c_id, d):
        v = daily_fund_map.get((c_id, d.year, d.month, d.day))
        if v is not None:
            return v
        v = monthly_fund_map.get((c_id, d.year, d.month))
        if v is not None:
            return v
        v = yearly_fund_map.get((c_id, d.year))
        return v if v is not None else False

    # 부율 맵 (날짜 범위 겹치는 Rate 레코드)
    rates_qs = list(Rate.objects.filter(
        movie_id=movie_id,
        client_id__in=client_ids_set,
        start_date__lte=date_to_obj,
        end_date__gte=date_from_obj,
    ))
    rate_map_d = defaultdict(list)
    for r in rates_qs:
        rate_map_d[r.client_id].append(r)

    theater_rate_map = {
        (tr.rate_id, tr.theater.auditorium_name): tr.share_rate
        for tr in TheaterRate.objects.filter(rate__in=rates_qs).select_related("theater")
    } if rates_qs else {}

    default_rate_map = {
        (dr.region_code, dr.theater_kind): dr.share_rate
        for dr in DefaultRate.objects.all()
    }

    def get_rate_value(c_id, entry_date, aud_name, client_info):
        for r in rate_map_d.get(c_id, []):
            if r.start_date <= entry_date <= r.end_date:
                tr_val = theater_rate_map.get((r.id, aud_name))
                return tr_val if tr_val is not None else r.share_rate
        return default_rate_map.get(
            (client_info.get("region_code"), client_info.get("theater_kind")),
            Decimal("50.0")
        )

    # 클라이언트 정보
    clients = {
        c["id"]: c for c in Client.objects.filter(id__in=client_ids_set).values(
            "id", "theater_name", "client_name", "excel_theater_name",
            "region_code", "theater_kind", "classification"
        )
    }

    # 배급사 극장명 맵
    dist_theater_name_map = {}
    user = request.user
    if user.is_authenticated and not user.is_superuser and hasattr(user, 'client_id') and user.client_id:
        for m in DistributorTheaterMap.objects.filter(
            distributor_id=user.client_id, theater_id__in=client_ids_set
        ).order_by("theater_id", "-apply_date"):
            if m.theater_id not in dist_theater_name_map:
                dist_theater_name_map[m.theater_id] = m.distributor_theater_name

    def get_system_name(cid):
        info = clients.get(cid, {})
        return info.get("excel_theater_name") or info.get("theater_name") or info.get("client_name") or ""

    # Python 집계: (client_id, share_rate_str, is_fund_exempt) 단위
    aggregated = {}
    for row in qs:
        cid = row["client_id"]
        entry_date = row["entry_date"]
        aud = row["auditorium"] or ""
        client_info = clients.get(cid, {})

        share_rate = get_rate_value(cid, entry_date, aud, client_info)
        is_fund_exempt = get_fund_exempt(cid, entry_date)

        group_key = (cid, str(share_rate), is_fund_exempt)
        if group_key not in aggregated:
            aggregated[group_key] = {
                "theater": get_system_name(cid),
                "distributor_theater": dist_theater_name_map.get(cid, ""),
                "format": format_display,
                "region": client_info.get("region_code") or "",
                "multi": client_info.get("theater_kind") or "",
                "classification": client_info.get("classification") or "",
                "share_rate": share_rate,
                "is_fund_exempt": is_fund_exempt,
                "visitor": 0,
                "_raw_amt": 0,
                "_excl_fund": Decimal("0"),
                "_min_date": entry_date,
                "_max_date": entry_date,
            }

        target = aggregated[group_key]
        visitor = row["total_visitor"] or 0
        try:
            fare = Decimal(str(row["fare"] or 0))
        except Exception:
            fare = Decimal("0")

        unit_excl_fund = fare if is_fund_exempt else (
            fare / Decimal("1.03")
        ).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

        target["visitor"] += visitor
        target["_raw_amt"] += int(fare) * visitor
        target["_excl_fund"] += unit_excl_fund * visitor
        if entry_date < target["_min_date"]:
            target["_min_date"] = entry_date
        if entry_date > target["_max_date"]:
            target["_max_date"] = entry_date

    # 최종 계산
    rows = []
    for data in aggregated.values():
        visitor = data["visitor"]
        rate_d = Decimal(str(data["share_rate"]))
        excl_fund = data["_excl_fund"]
        excl_vat = (excl_fund / Decimal("1.1")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        supply_val = (excl_vat * (rate_d / Decimal("100"))).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        vat_val = (supply_val * Decimal("0.1")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        total_payment = int(supply_val + vat_val)
        unit_price = round(int(supply_val) / visitor) if visitor > 0 else 0

        rows.append({
            "theater": data["theater"],
            "distributor_theater": data["distributor_theater"],
            "format": data["format"],
            "region": data["region"],
            "multi": data["multi"],
            "classification": data["classification"],
            "min_date": str(data["_min_date"]),
            "max_date": str(data["_max_date"]),
            "visitor": visitor,
            "ticket_revenue": data["_raw_amt"],
            "fund_excluded": int(excl_fund),
            "vat_excluded": int(excl_vat),
            "rate": float(data["share_rate"]),
            "supply_value": int(supply_val),
            "vat": int(vat_val),
            "total_payment": total_payment,
            "unit_price": unit_price,
        })

    # 정렬: 멀티순 → 직영/위탁 → 지역 → 극장명
    _MULTI_ORD = {"CGV": 0, "롯데": 1, "메가박스": 2, "씨네큐": 3}

    def _skey(r):
        m = r["multi"] or ""
        mi = next((v for k, v in _MULTI_ORD.items() if k in m), 99)
        ci = 0 if r["classification"] == "직영" else 1
        return (mi, ci, r["region"], r["theater"])

    rows.sort(key=_skey)

    meta = {
        "movie_title": primary.title_ko if primary else "",
        "release_date": str(primary.release_date) if primary and primary.release_date else "",
        "date_from": date_from_str,
        "date_to": date_to_str,
    }
    return Response({"meta": meta, "rows": rows})


@api_view(["GET"])
def score_movies_search(request):
    """
    영화명 검색 API (자동완성용)
    GET /Api/score/movies-search/?q=keyword
    """
    q = request.query_params.get("q", "").strip()
    if not q:
        return Response([])
    qs = Movie.objects.filter(title_ko__icontains=q, is_primary_movie=True).order_by("-release_date")
    user = request.user
    if user.is_authenticated and not user.is_superuser and hasattr(user, 'client_id') and user.client_id:
        qs = qs.filter(distributor_id=user.client_id)
    return Response([{
        "id": m.id,
        "title_ko": m.title_ko,
        "release_date": str(m.release_date) if m.release_date else "",
        "year": m.release_date.year if m.release_date else None,
    } for m in qs[:20]])


# ============================
#  주요작 좌석수 - 공통 헬퍼
# ============================
def _build_competitor_region_map():
    """Client 모델 기반 (brand, theater_name) → region_code 매핑 테이블 구성"""
    from client.models import Client

    clients = list(Client.objects.values(
        'theater_kind', 'excel_theater_name', 'theater_name', 'region_code'
    ))

    def norm_brand(kind):
        if not kind: return None
        k = kind.upper()
        if 'CGV' in k: return 'CGV'
        if 'LOTTE' in k or '롯데' in k: return 'LOTTE'
        if 'MEGA' in k or '메가' in k: return 'MEGABOX'
        return None

    region_map = {}
    for c in clients:
        b = norm_brand(c['theater_kind'])
        if not b: continue
        region = c['region_code']
        if not region: continue
        for field in ('excel_theater_name', 'theater_name'):
            name = c.get(field)
            if name:
                region_map[(b, name.replace(' ', ''))] = region
    return region_map


def _get_region(brand, theater, region_map):
    """(brand, theater_name) → region_code 조회 (퍼지 매칭 포함)"""
    def strip_prefix(s):
        return (s.replace("CGV", "").replace("롯데시네마", "").replace("롯데", "")
                  .replace("메가박스", "").replace("씨네큐", "").replace(" ", ""))

    clean = theater.replace(" ", "")
    r = region_map.get((brand, clean))
    if r:
        return r
    crawl_pure = strip_prefix(theater)
    for (mb, mn), mr in region_map.items():
        if mb != brand: continue
        cp = strip_prefix(mn)
        if crawl_pure == cp or (len(cp) >= 2 and len(crawl_pure) >= 2 and
                                (cp in crawl_pure or crawl_pure in cp)):
            return mr
    return '기타'


# ============================
#  주요작 영화 목록 API
# ============================
@api_view(["GET"])
def score_competitor_movies(request):
    """
    주요작 영화 목록 (날짜 범위 내 크롤링 데이터 기준)
    GET /Api/score/competitor/movies/?date_from=2025-01-01&date_to=2025-01-31&brands=CGV,LOTTE&regions=서울,경강
    """
    from crawler.models import MovieSchedule

    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")
    if not date_from_str or not date_to_str:
        return Response({"error": "date_from, date_to 필수"}, status=400)

    try:
        d_from = datetime.strptime(date_from_str, "%Y-%m-%d").date()
        d_to = datetime.strptime(date_to_str, "%Y-%m-%d").date()
    except ValueError:
        return Response({"error": "날짜 형식 오류 (YYYY-MM-DD)"}, status=400)

    brands_param = request.query_params.get("brands", "")
    brand_filter_map = {"CGV": "CGV", "롯데": "LOTTE", "메가박스": "MEGABOX"}
    selected_brands = [brand_filter_map[b] for b in brands_param.split(",") if b in brand_filter_map] if brands_param else []

    qs = MovieSchedule.objects.filter(play_date__gte=d_from, play_date__lte=d_to)
    if selected_brands:
        qs = qs.filter(brand__in=selected_brands)

    regions_param = request.query_params.get("regions", "")
    selected_regions = [r for r in regions_param.split(",") if r] if regions_param else []

    if selected_regions:
        region_map = _build_competitor_region_map()
        schedules_with_region = qs.values_list('brand', 'theater_name', 'movie_title').distinct()
        matched_titles = set()
        for brand, theater, title in schedules_with_region:
            region = _get_region(brand, theater, region_map)
            if region in selected_regions:
                matched_titles.add(title)
        titles = sorted(matched_titles)
    else:
        titles = list(
            qs.values_list('movie_title', flat=True).distinct().order_by('movie_title')
        )

    return Response({"movies": titles})


# ============================
#  주요작 좌석수 집계 API
# ============================
@api_view(["GET"])
def score_competitor_seats(request):
    """
    주요작 좌석수 집계 API (당기 + 전주 비교)
    GET /Api/score/competitor/seats/?date_from=2025-01-01&date_to=2025-01-07
        &movies=영화A,영화B&brands=CGV,롯데&regions=서울,경강
    """
    from crawler.models import MovieSchedule

    date_from_str = request.query_params.get("date_from")
    date_to_str = request.query_params.get("date_to")
    if not date_from_str or not date_to_str:
        return Response({"error": "date_from, date_to 필수"}, status=400)

    try:
        d_from = datetime.strptime(date_from_str, "%Y-%m-%d").date()
        d_to = datetime.strptime(date_to_str, "%Y-%m-%d").date()
    except ValueError:
        return Response({"error": "날짜 형식 오류 (YYYY-MM-DD)"}, status=400)

    lw_from = d_from - timedelta(days=7)
    lw_to = d_to - timedelta(days=7)

    # 브랜드 필터
    brands_param = request.query_params.get("brands", "")
    brand_filter_map = {"CGV": "CGV", "롯데": "LOTTE", "메가박스": "MEGABOX"}
    selected_brands = [brand_filter_map[b] for b in brands_param.split(",") if b in brand_filter_map] if brands_param else []

    # 영화 필터
    movies_param = request.query_params.get("movies", "")
    selected_movies = [m for m in movies_param.split(",") if m.strip()] if movies_param else []

    # 지역 필터
    regions_param = request.query_params.get("regions", "")
    selected_regions = [r for r in regions_param.split(",") if r.strip()] if regions_param else []
    region_map = _build_competitor_region_map() if selected_regions else {}

    def build_qs(df, dt):
        qs = MovieSchedule.objects.filter(play_date__gte=df, play_date__lte=dt)
        if selected_brands:
            qs = qs.filter(brand__in=selected_brands)
        if selected_movies:
            qs = qs.filter(movie_title__in=selected_movies)
        return qs.values('movie_title', 'play_date', 'brand', 'theater_name', 'total_seats', 'remaining_seats')

    def aggregate(schedules, date_offset_days=0):
        """
        schedules: iterable of dicts
        date_offset_days: shift play_date by N days (for aligning last week to this week)
        Returns: {title: {date_str: {total_seats, sold_seats}}}
        """
        agg = defaultdict(lambda: defaultdict(lambda: {"total_seats": 0, "sold_seats": 0}))
        for s in schedules:
            title = s['movie_title']
            if not title: continue
            play_date = s['play_date']
            if not play_date: continue
            if selected_regions:
                region = _get_region(s['brand'], s['theater_name'], region_map)
                if region not in selected_regions:
                    continue
            if date_offset_days:
                from datetime import date as date_type
                if hasattr(play_date, 'strftime'):
                    play_date = play_date + timedelta(days=date_offset_days)
                else:
                    play_date = datetime.strptime(str(play_date), "%Y-%m-%d").date() + timedelta(days=date_offset_days)
            ds = play_date.strftime("%Y-%m-%d") if hasattr(play_date, 'strftime') else str(play_date)
            ts = s['total_seats'] or 0
            rem = s['remaining_seats'] or 0
            sold = max(0, ts - rem)
            agg[title][ds]["total_seats"] += ts
            agg[title][ds]["sold_seats"] += sold
        return agg

    # 당기 집계
    curr_schedules = list(build_qs(d_from, d_to))
    curr_agg = aggregate(curr_schedules, date_offset_days=0)

    # 전주 집계 (날짜를 +7하여 당기 날짜에 맞춤)
    lw_schedules = list(build_qs(lw_from, lw_to))
    lw_agg = aggregate(lw_schedules, date_offset_days=7)

    # 날짜 목록 (당기 기준)
    all_dates = sorted({
        ds for title_data in curr_agg.values() for ds in title_data
    })

    # 영화 목록 결정 (선택된 영화 또는 데이터에 있는 모든 영화)
    if selected_movies:
        movie_titles = [m for m in selected_movies if m in curr_agg]
    else:
        movie_titles = sorted(curr_agg.keys())

    # 응답 구성
    movies_result = []
    grand_total = 0
    grand_sold = 0
    grand_lw_total = 0
    grand_daily = defaultdict(lambda: {"total_seats": 0, "sold_seats": 0})

    for title in movie_titles:
        daily_data = curr_agg.get(title, {})
        lw_daily = lw_agg.get(title, {})
        period_total = sum(d["total_seats"] for d in daily_data.values())
        period_sold = sum(d["sold_seats"] for d in daily_data.values())
        lw_period_total = sum(d["total_seats"] for d in lw_daily.values())

        # 날짜별 병합
        merged_daily = {}
        for ds in all_dates:
            curr_day = daily_data.get(ds, {})
            lw_day = lw_daily.get(ds, {})
            merged_daily[ds] = {
                "total_seats": curr_day.get("total_seats", 0),
                "sold_seats": curr_day.get("sold_seats", 0),
                "lw_total_seats": lw_day.get("total_seats", 0),
            }

        movies_result.append({
            "title": title,
            "daily": merged_daily,
            "period_total": period_total,
            "period_sold": period_sold,
            "lw_period_total": lw_period_total,
        })

        grand_total += period_total
        grand_sold += period_sold
        grand_lw_total += lw_period_total
        for ds in all_dates:
            grand_daily[ds]["total_seats"] += merged_daily[ds]["total_seats"]
            grand_daily[ds]["sold_seats"] += merged_daily[ds]["sold_seats"]

    return Response({
        "dates": all_dates,
        "movies": movies_result,
        "grand": {
            "period_total": grand_total,
            "period_sold": grand_sold,
            "lw_period_total": grand_lw_total,
            "daily": {ds: dict(v) for ds, v in grand_daily.items()},
        },
    })

