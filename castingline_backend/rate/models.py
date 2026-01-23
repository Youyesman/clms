from django.db import models
from client.models import *
from movie.models import *
from castingline_backend.utils.models import TimeStampedModel


class Rate(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rate_client",
    )  # 극장
    movie = models.ForeignKey(
        Movie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rate_movie",
    )  # 극장
    start_date = models.DateField(null=True, blank=True)  # 시작일자
    end_date = models.DateField(null=True, blank=True)  # 종료일자
    share_rate = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="부율"
    )
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)


class TheaterRate(TimeStampedModel):
    # 어느 공통 부율 설정(기간/영화/극장)에 속하는지 참조
    rate = models.ForeignKey(
        Rate,
        on_delete=models.CASCADE,
        related_name="theater_rates",
        verbose_name="공통 부율 설정",
    )
    # 해당 설정 내에서 예외를 적용할 상영관
    theater = models.ForeignKey(
        Theater,
        on_delete=models.CASCADE,
        related_name="theater_rates",
        verbose_name="상영관",
    )

    # 해당 상영관에만 적용할 예외 부율 (공통 share_rate보다 우선순위 높음)
    share_rate = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="부율"
    )
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)


class DefaultRate(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="defaultrate_client",
    )  # 극장
    is_domestic = models.BooleanField(default=False)  # 외화/한국영화
    theater_kind = models.CharField(max_length=255, null=True, blank=True)  # 멀티
    classification = models.CharField(
        max_length=255, null=True, blank=True
    )  # 구분(직영)
    region_code = models.CharField(max_length=255, null=True, blank=True)  # 지역
    share_rate = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, verbose_name="부율"
    )
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)
