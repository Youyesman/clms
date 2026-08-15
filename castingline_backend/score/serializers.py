from rest_framework import serializers
from .models import Score
from client.models import Client, Theater
from movie.models import Movie


class ClientSimpleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "client_name", "theater_name", "client_code"]


class MovieSimpleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movie
        fields = ["id", "title_ko", "movie_code"]


def build_theater_display_map(client_ids=None):
    """(client_id, 관코드) -> {"name": 관이름, "seat_count": 좌석수}

    S001: 같은 관이 [거래처 관리]-극장관 정보에 중복 등록돼 있으면
    가장 최근에 추가된 관 정보를 쓴다. (오래된 것부터 훑으며 덮어쓰기)
    """
    qs = Theater.objects.all()
    if client_ids is not None:
        qs = qs.filter(client_id__in=list(client_ids))

    mapping = {}
    for t in qs.order_by("created_date", "id").only(
        "client_id", "auditorium", "auditorium_name", "seat_count", "created_date"
    ):
        seat = None
        try:
            seat = int(str(t.seat_count).strip()) if t.seat_count else None
        except (TypeError, ValueError):
            seat = None
        mapping[(t.client_id, t.auditorium)] = {
            "name": t.auditorium_name or t.auditorium,
            "seat_count": seat,
        }
    return mapping


class ScoreSerializer(serializers.ModelSerializer):
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all())
    movie = serializers.PrimaryKeyRelatedField(queryset=Movie.objects.all())

    # ✅ auditorium_name은 DB에 저장하지 않는 읽기 전용 필드임을 명시
    auditorium_name = serializers.ReadOnlyField()
    # S001: 관명 옆 좌석수 표기용 (극장관 정보의 좌석수)
    seat_count = serializers.ReadOnlyField()

    class Meta:
        model = Score
        fields = [
            "id",
            "client",
            "movie",
            "entry_date",
            "auditorium",  # 실제 저장되는 값 (예: "003")
            "auditorium_name",  # 화면에 보여주는 이름 (예: "3관")
            "seat_count",  # 해당 관의 좌석수 (예: 144)
            "fare",
            "show_count",
            "visitor",
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)

        # 1. 상세 객체 정보 교체 (기존 유지)
        if instance.client:
            ret["client"] = ClientSimpleSerializer(instance.client).data
        if instance.movie:
            ret["movie"] = MovieSimpleSerializer(instance.movie).data

        # 2. 관 이름/좌석수 매핑 로직
        # ✅ ret["auditorium"]은 "003"인 상태로 건드리지 않습니다.
        theater_map = self.context.get("theater_map")
        if theater_map is None:
            # 단건 직렬화 폴백 — 목록 조회는 view에서 map을 넘겨 N+1을 피한다
            theater_map = build_theater_display_map(
                [instance.client_id] if instance.client_id else []
            )

        info = theater_map.get((instance.client_id, instance.auditorium))

        # ✅ 새로운 키인 "auditorium_name"에만 "3관"을 할당합니다.
        ret["auditorium_name"] = (info or {}).get("name") or instance.auditorium
        ret["seat_count"] = (info or {}).get("seat_count")

        return ret
