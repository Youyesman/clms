from rest_framework import serializers
from .models import Movie, Client


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "client_name"]  # 필요한 필드만 포함


from accounts.serializers import UserSerializer


class MovieSerializer(serializers.ModelSerializer):
    distributor = serializers.SerializerMethodField()
    production_company = serializers.SerializerMethodField()
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
        return (
            {"id": obj.distributor.id, "client_name": obj.distributor.client_name}
            if obj.distributor
            else None
        )

    def get_production_company(self, obj):
        return (
            {
                "id": obj.production_company.id,
                "client_name": obj.production_company.client_name,
            }
            if obj.production_company
            else None
        )

    def create(self, validated_data):
        request = self.context.get("request")
        data = request.data if request else {}

        distributor_data = data.get("distributor")
        production_data = data.get("production_company")

        distributor_obj = None
        if isinstance(distributor_data, dict):
            distributor_name = distributor_data.get("client_name", "").strip()
            if distributor_name:
                distributor_obj = Client.objects.filter(client_name=distributor_name).first()
        elif distributor_data: # ID로 전달된 경우 대응
            distributor_obj = Client.objects.filter(id=distributor_data).first()

        production_obj = None
        if isinstance(production_data, dict):
            production_name = production_data.get("client_name", "").strip()
            if production_name:
                production_obj = Client.objects.filter(client_name=production_name).first()
        elif production_data: # ID로 전달된 경우 대응
            production_obj = Client.objects.filter(id=production_data).first()

        movie = Movie.objects.create(
            distributor=distributor_obj,
            production_company=production_obj,
            **validated_data
        )
        return movie

    def update(self, instance, validated_data):
        request = self.context.get("request")
        data = request.data if request else {}

        distributor_data = data.get("distributor")
        production_data = data.get("production_company")

        distributor_name = ""
        if isinstance(distributor_data, dict):
            distributor_name = distributor_data.get("client_name", "").strip()

        production_name = ""
        if isinstance(production_data, dict):
            production_name = production_data.get("client_name", "").strip()

        if distributor_name:
            distributor_obj = Client.objects.filter(
                client_name=distributor_name
            ).first()
            instance.distributor = distributor_obj
        else:
            instance.distributor = None

        if production_name:
            production_obj = Client.objects.filter(client_name=production_name).first()
            instance.production_company = production_obj
        else:
            instance.production_company = None

        # 나머지 필드 처리
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance
