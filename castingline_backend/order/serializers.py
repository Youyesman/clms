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

    def validate(self, attrs):
        # O001: 개봉일 공란 저장 차단 — 비우는 수정도, 개봉일 없는 신규 등록도 거부
        if "release_date" in attrs and attrs["release_date"] is None:
            raise serializers.ValidationError(
                {"release_date": "개봉일은 필수 입력값입니다."})
        if self.instance is None and not attrs.get("release_date"):
            raise serializers.ValidationError(
                {"release_date": "개봉일은 필수 입력값입니다."})

        # O003(0826): 개봉일 변경 제한 — 실제 스코어가 존재하는 최초 날짜보다
        # 늦은 날짜를 개봉일로 지정하면 저장을 차단한다
        new_release = attrs.get("release_date")
        if new_release:
            movie = attrs.get("movie") or (self.instance.movie if self.instance else None)
            client = attrs.get("client") or (self.instance.client if self.instance else None)
            if movie and client:
                from django.db.models import Min
                from score.models import Score
                from .models import movie_family_ids

                first_score = (
                    Score.objects
                    .filter(movie_id__in=movie_family_ids(movie.id),
                            client_id=client.id,
                            entry_date__isnull=False)
                    .aggregate(mn=Min("entry_date"))["mn"]
                )
                if first_score and new_release > first_score:
                    raise serializers.ValidationError({
                        "release_date": (
                            f"개봉일보다 앞 날짜에 스코어가 존재합니다. "
                            f"(최초 스코어 발생일: {first_score})")})
        return attrs

    def update(self, instance, validated_data):
        # O002: 사용자가 종영일을 직접 저장(수정 또는 '종영일로 복사')하면
        # 자동 연장 강조 표시를 해제한다
        if "end_date" in validated_data:
            validated_data.setdefault("end_date_auto_updated", False)
        return super().update(instance, validated_data)

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

        # 부율관리 등록 여부/부율 값 (오더 상세 내역 '부율' 컬럼 — O001)
        # 목록 조회 시에는 뷰의 annotate 값을 쓰고, 단건 생성/수정 응답처럼
        # annotate가 없는 경우에만 개별 조회로 보충한다.
        has_rate = getattr(instance, "has_rate", None)
        rate_value = getattr(instance, "rate_value", None)
        if has_rate is None and instance.client_id and instance.movie_id:
            from rate.models import Rate

            rate_row = (
                Rate.objects.filter(
                    client_id=instance.client_id, movie_id=instance.movie_id
                )
                .order_by("-start_date")
                .first()
            )
            has_rate = rate_row is not None
            rate_value = rate_row.share_rate if rate_row else None
        representation["has_rate"] = bool(has_rate)
        representation["share_rate"] = (
            float(rate_value) if rate_value is not None else None
        )

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
