from .models import *
from rest_framework import serializers


class ClientSerializer(serializers.ModelSerializer):

    class Meta:
        model = Client
        fields = "__all__"


class TheaterSerializer(serializers.ModelSerializer):

    class Meta:
        model = Theater
        fields = "__all__"


class FareSerializer(serializers.ModelSerializer):

    class Meta:
        model = Fare
        fields = "__all__"


class TheaterMapSerializer(serializers.ModelSerializer):
    # 읽기 전용으로 배급사와 극장의 상세 정보를 포함
    distributor_details = serializers.SerializerMethodField()
    theater_details = serializers.SerializerMethodField()

    class Meta:
        model = DistributorTheaterMap
        fields = [
            "id",
            "distributor",
            "theater",
            "distributor_theater_name",
            "apply_date",
            "distributor_details",
            "theater_details",
        ]

    def get_distributor_details(self, obj):
        return {"id": obj.distributor.id, "client_name": obj.distributor.client_name}

    def get_theater_details(self, obj):
        return {
            "id": obj.theater.id,
            "client_name": obj.theater.client_name,
            "client_code": obj.theater.client_code,
        }
