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
    excel_theater_name2 = models.CharField(
        max_length=255, null=True, blank=True
    )  # 엑셀극장명2 (스코어 업로드 추가 매칭용 별칭)
    kofic_theater_name = models.CharField(
        max_length=255, null=True, blank=True
    )  # 영진위극장명 (영진위 일반극장 업로드 매칭용)
    kofic_theater_name2 = models.CharField(
        max_length=255, null=True, blank=True
    )  # 영진위극장명2 (영진위 추가 매칭용 별칭 — N001)
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
    # S001(0829): 부금 담당자 메일은 최대 3개까지 ','/';' 로 구분해 저장한다.
    # EmailField(단일 주소 strict 검증)면 2개 이상 입력이 저장되지 않아 CharField로 바꾸고,
    # 주소별 형식 검증은 시리얼라이저(ClientSerializer.validate_settlement_email)가 맡는다.
    settlement_email = models.CharField(
        max_length=255, null=True, blank=True
    )  # 담당자(부금) 메일주소 — 최대 3개, ',' 또는 ';' 구분
    invoice_email_address = models.EmailField(
        null=True, blank=True
    )  # 세금계산서 발행 메일주소
    invoice_email_address2 = models.EmailField(
        null=True, blank=True
    )  # 세금계산서 발행 메일주소2
    settlement_remarks = models.TextField(null=True, blank=True)  # 부금특이사항
    operational_status = models.BooleanField(
        null=True, blank=True
    )  # 영업 상태: True=영업중, False=폐관
    is_car_theater = models.BooleanField(null=True, blank=True)  # 자동차극장여부
    # KOBIS(영진위) 상세내역에 스코어가 넘어오지 않는 극장 표시. 기본은 연동(True).
    kobis_linked = models.BooleanField(default=True)  # KOBIS 연동 여부
    rate_exception_type = models.CharField(
        max_length=10, null=True, blank=True
    )  # 부율 예외극장 구분: '모두'=한국+외화 55%, '외화'=외화만 55%, 빈값=해당없음
    # F001(0903): 이세로 합산용 메인(상위) 거래처.
    # 메가박스코엑스(발전기금면제관)처럼 부금 계산을 위해 부과관/면제관으로 나눠 둔
    # 극장은 이 값을 본관으로 지정한다. 화면·스코어·부금 계산은 그대로 분리 유지하고,
    # 이세로 다운로드에서만 본관과 한 행으로 합산·본관 극장명으로 출력된다.
    # (같은 사업자번호로 서로 다른 극장을 운영하는 곳을 잘못 묶지 않기 위해
    #  사업자번호가 아니라 이 명시적 지정을 기준으로 삼는다)
    parent_client = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="child_clients",
    )  # 이세로 합산 메인 거래처

    distributor_theater_name = models.CharField(
        max_length=10, null=True, blank=True, default="N"
    )
    login_id = models.CharField(max_length=255, null=True, blank=True)
    login_password = models.CharField(max_length=255, null=True, blank=True)
    created_date = models.DateTimeField(auto_now_add=True)
    updated_date = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.client_name} - {self.theater_name}"


class SettlementDepartment(models.Model):
    """
    부금처 목록.
    하드코딩 대신 DB로 관리 — 거래처 관리 화면에서 추가/삭제한다.
    """

    name = models.CharField(max_length=255, unique=True, verbose_name="부금처명")
    sort_order = models.IntegerField(default=0, verbose_name="정렬순서")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name = "부금처"

    def __str__(self):
        return self.name


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
    kofic_auditorium_name = models.CharField(
        max_length=100, null=True, blank=True
    )  # 영진위관이름 (영진위 일반극장 업로드 매칭용)
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
