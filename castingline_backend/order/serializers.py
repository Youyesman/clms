from rest_framework import serializers
from .models import Order, OrderList
from movie.models import Movie
from movie.serializers import MovieSerializer
from client.serializers import ClientSerializer


class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = "__all__"
        # create_user/update_user는 TimeStampedModel.save()에서 자동 설정되므로
        # 쓰기 입력(중첩 dict 포함)을 무시한다.
        read_only_fields = ["create_user", "update_user"]

    def to_internal_value(self, data):
        # 읽기 시 movie/client를 중첩 dict로 내려보내므로, 전체 객체를 그대로
        # PATCH로 되돌려도 동작하도록 dict는 id(pk)로 평탄화한다.
        data = data.copy()
        for field in ("movie", "client"):
            value = data.get(field)
            if isinstance(value, dict):
                data[field] = value.get("id")
        return super().to_internal_value(data)

    def to_representation(self, instance):
        """
        읽기(GET) 할 때만 호출되는 메서드입니다.
        출력 데이터를 사용자 정의할 때 사용합니다.
        """
        representation = super().to_representation(instance)

        # movie 필드가 있으면 상세 정보로 교체해서 보여줌
        if instance.movie:
            representation["movie"] = MovieSerializer(instance.movie).data
        else:
            representation["movie"] = None

        # client 필드가 있으면 상세 정보로 교체해서 보여줌
        if instance.client:
            representation["client"] = ClientSerializer(instance.client).data
        else:
            representation["client"] = None

        return representation


from accounts.serializers import UserSerializer


class OrderListSerializer(serializers.ModelSerializer):
    # movie는 id로 입력 받고, MovieSerializer로 출력
    movie = serializers.PrimaryKeyRelatedField(queryset=Movie.objects.all())

    class Meta:
        model = OrderList
        fields = "__all__"
        # create_user/update_user는 TimeStampedModel.save()에서 자동 설정되므로
        # 쓰기 입력(중첩 dict 포함)을 무시한다.
        read_only_fields = ["create_user", "update_user"]

    def to_representation(self, instance):
        """응답 데이터에서 movie와 create_user는 상세 정보로 출력"""
        representation = super().to_representation(instance)
        representation["movie"] = (
            MovieSerializer(instance.movie).data if instance.movie else None
        )
        if instance.create_user:
            representation["create_user"] = UserSerializer(instance.create_user).data
        return representation
