from django.db import models
from client.models import Client
from castingline_backend.utils.models import TimeStampedModel


class Fund(TimeStampedModel):
    # Client 모델의 client_code를 참조하는 외래키
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="funds",
    )
    yyyy = models.PositiveIntegerField()  # 연도 (2021, 2022 등)
    fund_yn = models.BooleanField(default=False)  # Y/N을 Boolean으로 저장
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    class Meta:
        # 동일 업체가 같은 연도에 중복 데이터가 쌓이지 않도록 유니크 설정
        unique_together = ("client", "yyyy")

    def __str__(self):
        return f"{self.client.client_code} - {self.yyyy} ({self.fund_yn})"


class MonthlyFund(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="monthly_funds",
    )
    yyyy = models.PositiveIntegerField()
    mm = models.PositiveSmallIntegerField()  # 월 (1~12)
    fund_yn = models.BooleanField(default=False)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    class Meta:
        # 업체별 연/월 단위 중복 데이터 방지
        unique_together = ("client", "yyyy", "mm")

    def __str__(self):
        return f"{self.client.client_code} - {self.yyyy}/{self.mm:02d} ({self.fund_yn})"


class DailyFund(TimeStampedModel):
    client = models.ForeignKey(Client, on_delete=models.CASCADE)
    yyyy = models.IntegerField()
    mm = models.IntegerField()
    dd = models.IntegerField()
    fund_yn = models.BooleanField(default=False)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("client", "yyyy", "mm", "dd")
