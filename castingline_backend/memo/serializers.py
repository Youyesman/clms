from rest_framework import serializers

from .models import SharedMemo


class SharedMemoSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SharedMemo
        fields = ["content", "updated_at", "updated_by_name"]
        read_only_fields = ["updated_at", "updated_by_name"]

    def get_updated_by_name(self, obj):
        u = obj.updated_by
        if not u:
            return ""
        return getattr(u, "nickname", None) or getattr(u, "username", "") or ""
