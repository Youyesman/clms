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
    # 포맷 버킷(compare.format_bucket 값: "2D"/"4DX"/"ATMOS" 등).
    # 빈 문자열은 극장 전체(포맷 미구분) 조정 — 포맷 분리 이전에 저장된 조정 포함.
    screen_format = models.CharField(max_length=40, blank=True, default="",
                                     verbose_name="상영 포맷")
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
        unique_together = ("yyyymm", "movie", "client", "screen_format")
        verbose_name = "부금 정산 수동조정"

    def __str__(self):
        return (f"{self.yyyymm} {self.movie_id}/{self.client_id} "
                f"Δ공급가 {self.supply_delta:+d} Δ부가세 {self.vat_delta:+d}")


class SettlementConfirm(models.Model):
    """부금 정산 극장별 확인 처리 (월×대표영화×극장 단위).

    월초에 지난달 부금정산 내역을 전 극장 확인하는 업무용 체크 상태.
    - 대사 모달에서 '파일값으로 조정'/'일괄 조정' 저장 시 자동 확인
    - 대사 모달/정산 관리 테이블에서 행별·일괄 수동 확인/해제 가능
    """
    yyyymm = models.CharField(max_length=7, verbose_name="부금년월")  # "2026-06"
    movie = models.ForeignKey("movie.Movie", on_delete=models.CASCADE,
                              verbose_name="대표영화")
    client = models.ForeignKey("client.Client", on_delete=models.CASCADE,
                               verbose_name="극장")
    source = models.CharField(max_length=20, blank=True, default="수동",
                              verbose_name="확인 경로")  # 수동/조정/대사
    confirmed_by = models.CharField(max_length=100, blank=True, default="",
                                    verbose_name="확인자")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("yyyymm", "movie", "client")
        verbose_name = "부금 정산 확인"

    def __str__(self):
        return f"{self.yyyymm} {self.movie_id}/{self.client_id} 확인({self.source})"


class AiParseCache(models.Model):
    """위탁/일반극장 부금정산서 PDF의 AI(OpenAI) 추출 결과 캐시.

    같은 파일을 다시 업로드해 대사를 재실행해도 재과금/재분석 없이
    저장된 추출 결과를 그대로 사용한다. (파일 내용 sha256 + 모델명 기준)
    """
    file_hash = models.CharField(max_length=64, verbose_name="파일 sha256")
    model = models.CharField(max_length=64, verbose_name="AI 모델")
    filename = models.CharField(max_length=255, blank=True, default="")
    result = models.JSONField(verbose_name="추출 결과")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("file_hash", "model")
        verbose_name = "부금정산서 AI 추출 캐시"

    def __str__(self):
        return f"{self.filename} ({self.model})"
