from django.db import models
from castingline_backend.utils.models import TimeStampedModel

# Create your models here.


class Client(TimeStampedModel):
    client_code = models.CharField(
        max_length=255, null=True, blank=True, unique=True
    )  # 거래처 코드
    client_type = models.CharField(max_length=255, null=True, blank=True)  # 거래처 구분
    client_name = models.CharField(max_length=255, null=True, blank=True)  # 거래처명
    client_status = models.CharField(
        max_length=255, null=True, blank=True
    )  # 상태 (현재 안씀!!!)
    classification = models.CharField(
        max_length=255, null=True, blank=True
    )  # 구분 (직영)
    by4m_theater_code = models.CharField(
        max_length=255, null=True, blank=True
    )  # 바이포엠 극장코드
    theater_code = models.CharField(max_length=255, null=True, blank=True)  # 극장코드
    theater_name = models.CharField(max_length=255, null=True, blank=True)  # 극장명
    excel_theater_name = models.CharField(
        max_length=255, null=True, blank=True
    )  # 엑셀극장명
    region_code = models.CharField(max_length=255, null=True, blank=True)  # 지역
    theater_kind = models.CharField(max_length=255, null=True, blank=True)  # 멀티
    business_operator = models.CharField(
        max_length=255, null=True, blank=True
    )  # 종사업자
    legal_entity_type = models.CharField(
        max_length=255, null=True, blank=True
    )  # 법인/개인 구분
    business_registration_number = models.CharField(
        max_length=255, null=True, blank=True
    )  # 사업자번호
    business_name = models.CharField(max_length=255, null=True, blank=True)  # 사업자명
    business_category = models.CharField(max_length=255, null=True, blank=True)  # 업태
    business_industry = models.CharField(max_length=255, null=True, blank=True)  # 업종
    business_address = models.CharField(
        max_length=2550, null=True, blank=True
    )  # 사업장 소재지
    representative_name = models.CharField(
        max_length=255, null=True, blank=True
    )  # 대표자명
    settlement_department = models.CharField(
        max_length=255, null=True, blank=True
    )  # 부금처
    settlement_mobile_number = models.CharField(
        max_length=255, null=True, blank=True
    )  # 부금담당자 휴대폰
    settlement_phone_number = models.CharField(
        max_length=255, null=True, blank=True
    )  # 전화번호(부금)
    fax_number = models.CharField(max_length=255, null=True, blank=True)  # 팩스번호
    settlement_contact = models.CharField(
        max_length=255, null=True, blank=True
    )  # 담당자(부금)
    representative_phone_number = models.CharField(
        max_length=255, null=True, blank=True
    )  # 전화번호(대표)
    settlement_email = models.EmailField(null=True, blank=True)  # 담당자(부금) 메일주소
    invoice_email_address = models.EmailField(
        null=True, blank=True
    )  # 세금계산서 발행 메일주소
    invoice_email_address2 = models.EmailField(
        null=True, blank=True
    )  # 세금계산서 발행 메일주소2
    settlement_remarks = models.TextField(null=True, blank=True)  # 부금특이사항
    operational_status = models.BooleanField(
        null=True, blank=True
    )  # 삭제(폐관) True가 폐관임.
    is_car_theater = models.BooleanField(null=True, blank=True)  # 자동차극장여부

    distributor_theater_name = models.CharField(
        max_length=10, null=True, blank=True, default="N"
    )
    login_id = models.CharField(max_length=255, null=True, blank=True)
    login_password = models.CharField(max_length=255, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.client_name} - {self.theater_name}"


class Theater(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="theater_client",
    )  # 극장
    auditorium = models.CharField(max_length=10, null=True, blank=True)
    seat_count = models.CharField(max_length=10, null=True, blank=True)
    auditorium_name = models.CharField(max_length=100, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)


class Fare(TimeStampedModel):
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fare_client",
    )  # 극장
    fare = models.CharField(max_length=10, null=True, blank=True)
    fare_remark = models.CharField(max_length=10, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)


class DistributorTheaterMap(models.Model):
    # 이 매핑 정보의 주인 (예: NEW, 콘텐츠판다 등 배급사)
    distributor = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="theater_maps"
    )
    # 실제 시스템에 등록된 극장
    theater = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name="distributor_mappings"
    )

    distributor_theater_name = models.CharField(
        max_length=255, verbose_name="배급사측 극장명"
    )

    # ✅ 적용 시작 날짜 필드 추가
    apply_date = models.DateField(verbose_name="적용 시작일")

    class Meta:
        # ✅ 배급사 + 극장 + 적용날짜 세 가지 조합이 유일해야 함
        unique_together = ("distributor", "theater", "apply_date")
        # 최신 날짜가 가장 먼저 오도록 정렬 설정 (선택 사항)
        ordering = ["-apply_date", "distributor_theater_name"]

    def __str__(self):
        return f"[{self.apply_date}] {self.distributor.client_name} -> {self.theater.client_name} ({self.distributor_theater_name})"
