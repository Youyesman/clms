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
