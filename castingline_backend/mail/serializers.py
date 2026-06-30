from rest_framework import serializers

from .models import CollectedSettlement, SettlementTargetMovie


class SettlementTargetMovieSerializer(serializers.ModelSerializer):
    movie_title = serializers.CharField(source="movie.title_ko", read_only=True)
    movie_code = serializers.CharField(source="movie.movie_code", read_only=True)
    release_date = serializers.DateField(source="movie.release_date", read_only=True)

    class Meta:
        model = SettlementTargetMovie
        fields = [
            "id",
            "movie",
            "movie_title",
            "movie_code",
            "release_date",
            "aliases",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class CollectedSettlementSerializer(serializers.ModelSerializer):
    movie_id = serializers.IntegerField(source="movie.id", read_only=True)

    class Meta:
        model = CollectedSettlement
        fields = [
            "id",
            "movie_id",
            "movie_title",
            "month",
            "matched_keyword",
            "matched_in",
            "mail_folder",
            "mail_uid",
            "mail_subject",
            "mail_from",
            "mail_date",
            "attachment_index",
            "filename",
            "content_type",
            "size",
            "created_at",
        ]
