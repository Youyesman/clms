from .models import *
from rest_framework import serializers


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    groups_display = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "password", "nickname", "email", "team", 
            "direct_call", "phone", "country", "is_active", "is_superuser", 
            "groups", "groups_display", "last_login", "created_date"
        ]

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
