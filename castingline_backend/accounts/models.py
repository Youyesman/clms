from django.db import models
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import Group


class User(AbstractUser):
    nickname = models.CharField(max_length=50, unique=True)
    email = models.CharField(max_length=50, blank=True, null=True)
    team = models.CharField(max_length=50, null=True)
    direct_call = models.CharField(max_length=50, blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    country = models.CharField(max_length=2)
    # 배급사 매핑: 일반 유저가 어느 배급사(Client)에 소속되었는지 연결
    client = models.ForeignKey(
        "client.Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
        verbose_name="소속 배급사",
    )
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.nickname
