from rest_framework import serializers
from .models import Rate, DefaultRate, TheaterRate
from client.serializers import ClientSerializer
from movie.serializers import MovieSerializer
from client.models import Client, Theater
from movie.models import Movie
from order.models import Order


class RateSerializer(serializers.ModelSerializer):
    # ✅ 쓰기(POST/PATCH)가 가능하도록 PrimaryKeyRelatedField로 설정합니다.
    client = serializers.PrimaryKeyRelatedField(queryset=Client.objects.all())
    movie = serializers.PrimaryKeyRelatedField(queryset=Movie.objects.all())

    class Meta:
        model = Rate
        fields = "__all__"

    def to_representation(self, instance):
        """
        데이터 조회(GET) 또는 저장 후 응답 시,
        ID 대신 상세 객체 정보를 반환하도록 가공합니다.
        """
        # 1. 기본 시리얼라이즈 결과(ID 포함)를 가져옵니다.
        ret = super().to_representation(instance)

        # 2. client 정보가 있다면 상세 객체로 교체합니다.
        if instance.client:
            ret["client"] = ClientSerializer(instance.client).data

        # 3. movie 정보가 있다면 상세 객체로 교체합니다.
        if instance.movie:
            ret["movie"] = MovieSerializer(instance.movie).data

        return ret


class TheaterRateSerializer(serializers.ModelSerializer):
    # 쓰기 시 ID를 받기 위한 설정
    theater = serializers.PrimaryKeyRelatedField(queryset=Theater.objects.all())

    class Meta:
        model = TheaterRate
        fields = [
            "id",
            "rate",
            "theater",
            "share_rate",
            "created_date",
            "updated_date",
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)

        # 상영관 정보 상세화 (극장명 포함)
        if instance.theater:
            ret["theater_name"] = instance.theater.auditorium_name
            ret["auditorium"] = instance.theater.auditorium
            if instance.theater.client:
                ret["client_name"] = instance.theater.client.client_name
        return ret


class DefaultRateSerializer(serializers.ModelSerializer):
    # ✅ 저장할 때는 ID를 받아야 하므로 PrimaryKeyRelatedField를 사용합니다.
    client = serializers.PrimaryKeyRelatedField(
        queryset=Client.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = DefaultRate
        fields = "__all__"

    # ✅ 조회(GET)할 때만 클라이언트 정보를 상세하게 변환합니다.
    def to_representation(self, instance):
        response = super().to_representation(instance)
        if instance.client:
            # 조회 시에는 기존 ClientSerializer를 사용하여 중첩 객체로 반환
            response["client"] = ClientSerializer(instance.client).data
        return response


class OrderSerializer(serializers.ModelSerializer):
    # DB의 annotate에서 계산된 값을 읽어옴
    has_rate = serializers.BooleanField(read_only=True)
    client_name = serializers.CharField(source="client.client_name", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "client",
            "client_name",
            "movie",
            "release_date",
            "start_date",
            "end_date",
            "has_rate",  # 추가된 필드
        ]
