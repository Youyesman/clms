from django.db import models
from client.models import *
from castingline_backend.utils.models import TimeStampedModel


class Movie(TimeStampedModel):
    movie_code = models.CharField(max_length=20, unique=True)  # 영화 코드 (tt_code)
    is_primary_movie = models.BooleanField(
        default=False
    )  # 대표 영화 지정 (tt_type이 null이면 True)
    title_ko = models.CharField(max_length=255)  # 한글 제목
    title_en = models.CharField(max_length=255, null=True, blank=True)  # 영어 제목
    running_time_minutes = models.PositiveIntegerField(
        null=True, blank=True
    )  # 상영 시간 (분)

    distributor = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movie_distributor",
    )  # 배급사
    production_company = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="production_company",
    )  # 제작사

    rating = models.CharField(max_length=50, null=True, blank=True)  # 관람 등급
    genre = models.CharField(max_length=100, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    director = models.CharField(max_length=100, null=True, blank=True)
    cast = models.TextField(null=True, blank=True)

    release_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    closure_completed_date = models.DateField(null=True, blank=True)
    is_finalized = models.BooleanField(
        default=False
    )  # up_id로 판단했지만 여기선 Boolean 처리

    primary_movie_code = models.CharField(
        max_length=20, null=True, blank=True
    )  # 대표 영화 코드 (parent_code)

    media_type = models.CharField(max_length=50, null=True, blank=True)  # 필름/디지털
    audio_mode = models.CharField(
        max_length=50, null=True, blank=True
    )  # 자막/영어자막/더빙
    viewing_dimension = models.CharField(
        max_length=50, null=True, blank=True
    )  # 2D/3D/4D
    screening_type = models.CharField(
        max_length=50, null=True, blank=True
    )  # IMAX/ATMOS
    dx4_viewing_dimension = models.CharField(
        max_length=50, null=True, blank=True
    )  # 4DX/Super-4D/Dolby
    imax_l = models.CharField(max_length=50, null=True, blank=True)  # IMAX-L
    screen_x = models.CharField(max_length=50, null=True, blank=True)  # SCREEN-X
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)
    is_public = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.title_ko} ({self.movie_code})"


class CachedArticle(models.Model):
    """뉴스/블로그 기사 캐시 (30분마다 갱신)"""

    ARTICLE_TYPES = [
        ("news", "뉴스"),
        ("blog", "블로그"),
    ]

    article_type = models.CharField(max_length=10, choices=ARTICLE_TYPES)
    query = models.CharField(max_length=255)  # 검색어
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    link = models.URLField(max_length=1000)
    original_link = models.URLField(max_length=1000, blank=True, default="")
    source = models.CharField(max_length=100, blank=True, default="")  # 언론사 or 블로거
    pub_date = models.CharField(max_length=100, blank=True, default="")
    image = models.URLField(max_length=1000, blank=True, default="")
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fetched_at"]
        indexes = [
            models.Index(fields=["article_type", "query"]),
        ]

    def __str__(self):
        return f"[{self.article_type}] {self.title[:50]}"

