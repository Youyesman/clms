from django.db import models
from client.models import *
from movie.models import *
from castingline_backend.utils.models import TimeStampedModel


class Score(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="score_client",
    )  # 극장
    movie = models.ForeignKey(
        Movie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="score_movie",
    )  # 영화
    entry_date = models.DateField(null=True, blank=True)  # 입회일자
    auditorium = models.CharField(max_length=10, null=True, blank=True)  # 관 이름
    fare = models.CharField(max_length=10, null=True, blank=True)  # 요금
    show_count = models.CharField(max_length=10, null=True, blank=True)  # 몇회차인지
    visitor = models.CharField(max_length=10, null=True, blank=True)  # 방문객
    # 업로드 원본 파일명 — 메일함(CGV/롯데) 재업로드 시 같은 파일만 교체하는 기준 (M001)
    source_file = models.CharField(max_length=255, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "entry_date",
                    "client",
                    "movie",
                    "auditorium",
                    "fare",
                    "show_count",
                ],
                name="unique_score_record",
            )
        ]
