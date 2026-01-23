from django.db import models
from client.models import *
from movie.models import *
from castingline_backend.utils.models import TimeStampedModel

# Create your models here.


class OrderList(TimeStampedModel):
    movie = models.OneToOneField(  # ✅ ForeignKey에서 OneToOneField로 변경
        Movie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orderlist_movie",
        verbose_name="대상 영화"
    )
    start_date = models.DateField(null=True, blank=True)  # 오더일자(보통 개봉일)
    remark = models.TextField(null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)
    is_auto_generated = models.BooleanField(default=False)


class Order(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_client",
    )  # 극장명
    movie = models.ForeignKey(
        Movie,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_movie",
    )
    remark = models.TextField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)  # 오더일자(보통 개봉일)
    release_date = models.DateField(null=True, blank=True)  # 개봉일
    end_date = models.DateField(null=True, blank=True)  # 종영일
    last_screening_date = models.DateField(null=True, blank=True)  # 마지막 상영일
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)
    is_auto_generated = models.BooleanField(default=False)
