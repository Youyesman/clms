from django.db import models


class SettlementAdjustment(models.Model):
    """부금 정산 수동 조정 (원 단위 대사 잔차 확정용).

    직영 부금정산서와 시스템 계산값이 반올림 구조 차이로 ±수원 어긋날 때,
    극장×대표영화×월 단위로 차액(delta)을 저장한다.
    - 정산 화면(get_processed_data)에는 '(수동조정)' 행으로 추가돼
      합계/엑셀/이세로에 반영되고, 원래 계산값 행은 그대로 남는다.
    - 조정 시점의 시스템 원래값(original)도 함께 보관해 언제든 확인 가능.
    """
    yyyymm = models.CharField(max_length=7, verbose_name="부금년월")  # "2026-06"
    movie = models.ForeignKey("movie.Movie", on_delete=models.CASCADE,
                              verbose_name="대표영화")
    client = models.ForeignKey("client.Client", on_delete=models.CASCADE,
                               verbose_name="극장")
    supply_delta = models.IntegerField(default=0, verbose_name="공급가액 조정액")
    vat_delta = models.IntegerField(default=0, verbose_name="부가세 조정액")
    payout_delta = models.IntegerField(default=0, verbose_name="지급금 조정액")
    supply_original = models.BigIntegerField(null=True, blank=True, verbose_name="조정 전 공급가액")
    vat_original = models.BigIntegerField(null=True, blank=True, verbose_name="조정 전 부가세")
    payout_original = models.BigIntegerField(null=True, blank=True, verbose_name="조정 전 지급금")
    note = models.CharField(max_length=200, blank=True, default="", verbose_name="비고")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("yyyymm", "movie", "client")
        verbose_name = "부금 정산 수동조정"

    def __str__(self):
        return (f"{self.yyyymm} {self.movie_id}/{self.client_id} "
                f"Δ공급가 {self.supply_delta:+d} Δ부가세 {self.vat_delta:+d}")
