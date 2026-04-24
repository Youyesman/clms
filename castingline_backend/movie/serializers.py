from rest_framework import serializers
from .models import Movie, Client


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "client_name"]  # 필요한 필드만 포함


from accounts.serializers import UserSerializer


def _client_to_dict(client):
    return {"id": client.id, "client_name": client.client_name} if client else None

def _resolve_client(data):
    """dict(client_name) 또는 ID로 Client 조회"""
    if isinstance(data, dict):
        name = data.get("client_name", "").strip()
        return Client.objects.filter(client_name=name).first() if name else None
    if data:
        return Client.objects.filter(id=data).first()
    return None


class MovieSerializer(serializers.ModelSerializer):
    distributor = serializers.SerializerMethodField()
    distributor_2 = serializers.SerializerMethodField()
    distributor_3 = serializers.SerializerMethodField()
    production_company = serializers.SerializerMethodField()
    production_company_2 = serializers.SerializerMethodField()
    production_company_3 = serializers.SerializerMethodField()
    movie_code = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Movie
        fields = "__all__"

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        if instance.create_user:
            representation["create_user"] = UserSerializer(instance.create_user).data
        return representation

    def get_distributor(self, obj):
        return _client_to_dict(obj.distributor)

    def get_distributor_2(self, obj):
        return _client_to_dict(obj.distributor_2)

    def get_distributor_3(self, obj):
        return _client_to_dict(obj.distributor_3)

    def get_production_company(self, obj):
        return _client_to_dict(obj.production_company)

    def get_production_company_2(self, obj):
        return _client_to_dict(obj.production_company_2)

    def get_production_company_3(self, obj):
        return _client_to_dict(obj.production_company_3)

    def create(self, validated_data):
        request = self.context.get("request")
        data = request.data if request else {}

        movie = Movie.objects.create(
            distributor=_resolve_client(data.get("distributor")),
            distributor_2=_resolve_client(data.get("distributor_2")),
            distributor_3=_resolve_client(data.get("distributor_3")),
            production_company=_resolve_client(data.get("production_company")),
            production_company_2=_resolve_client(data.get("production_company_2")),
            production_company_3=_resolve_client(data.get("production_company_3")),
            **validated_data
        )
        return movie

    def update(self, instance, validated_data):
        request = self.context.get("request")
        data = request.data if request else {}

        instance.distributor = _resolve_client(data.get("distributor"))
        instance.distributor_2 = _resolve_client(data.get("distributor_2"))
        instance.distributor_3 = _resolve_client(data.get("distributor_3"))
        instance.production_company = _resolve_client(data.get("production_company"))
        instance.production_company_2 = _resolve_client(data.get("production_company_2"))
        instance.production_company_3 = _resolve_client(data.get("production_company_3"))

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
