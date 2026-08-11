from .models import *
from rest_framework import serializers


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    groups_display = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    client_type = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "password", "nickname", "email", "team",
            "direct_call", "phone", "country", "is_active", "is_superuser",
            "groups", "groups_display", "last_login", "created_date",
            "client", "client_id", "client_name", "client_type",
        ]
        # 필수는 아이디/비밀번호/소속사뿐 — 나머지 정보성 필드는 비워도 저장 가능
        extra_kwargs = {
            "nickname": {"required": False, "allow_blank": True},
            "email": {"required": False, "allow_blank": True, "allow_null": True},
            "team": {"required": False, "allow_blank": True, "allow_null": True},
            "direct_call": {"required": False, "allow_blank": True, "allow_null": True},
            "phone": {"required": False, "allow_blank": True, "allow_null": True},
            "country": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        # 닉네임은 unique 제약이 있어 빈 값이 두 개 이상이면 충돌 → 빈 값으로 오면 아이디로 대체
        # (nickname 키 없이 오는 부분 수정에서는 기존 닉네임을 건드리지 않음)
        if not attrs.get("nickname") and ("nickname" in attrs or self.instance is None):
            username = attrs.get("username") or (self.instance.username if self.instance else None)
            if username:
                attrs["nickname"] = username
        return attrs

    def get_client_name(self, obj):
        if obj.client:
            return obj.client.client_name
        return None

    def get_client_type(self, obj):
        if obj.client:
            return obj.client.client_type
        return None

    def get_groups_display(self, obj):
        return [group.name for group in obj.groups.all()]

    def create(self, validated_data):
        groups_data = validated_data.pop("groups", [])
        password = validated_data.pop("password", None)
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.save()
        if groups_data:
            user.groups.set(groups_data)
        return user

    def update(self, instance, validated_data):
        groups_data = validated_data.pop("groups", None)
        password = validated_data.pop("password", None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        if password:
            instance.set_password(password)
        
        if groups_data is not None:
            instance.groups.set(groups_data)
            
        instance.save()
        return instance
