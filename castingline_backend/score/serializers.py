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


class ScoreSerializer(serializers.ModelSerializer):
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all())
    movie = serializers.PrimaryKeyRelatedField(queryset=Movie.objects.all())

    # ✅ auditorium_name은 DB에 저장하지 않는 읽기 전용 필드임을 명시
    auditorium_name = serializers.ReadOnlyField()

    class Meta:
        model = Score
        fields = [
            "id",
            "client",
            "movie",
            "entry_date",
            "auditorium",  # 실제 저장되는 값 (예: "003")
            "auditorium_name",  # 화면에 보여주는 이름 (예: "3관")
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

        # 2. 관 이름 매핑 로직
        # ✅ ret["auditorium"]은 "003"인 상태로 건드리지 않습니다.
        theater_map = self.context.get("theater_map")

        display_name = instance.auditorium  # 기본값은 코드값

        if theater_map:
            display_name = theater_map.get(
                (instance.client_id, instance.auditorium), instance.auditorium
            )
        else:
            theater = Theater.objects.filter(
                client=instance.client, auditorium=instance.auditorium
            ).first()
            if theater and theater.auditorium_name:
                display_name = theater.auditorium_name

        # ✅ 새로운 키인 "auditorium_name"에만 "3관"을 할당합니다.
        ret["auditorium_name"] = display_name

        return ret
