import re

from .models import *
from rest_framework import serializers

# S001(0829): 부금 담당자 메일 다중 입력 — ',' 또는 ';' 로 최대 3개까지
SETTLEMENT_EMAIL_MAX = 3
_EMAIL_RE = re.compile(r"^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$")


def split_emails(raw):
    """',' / ';' 구분 문자열 → 공백 제거한 이메일 목록 (빈 항목 제거)."""
    if not raw:
        return []
    return [p.strip() for p in re.split(r"[,;]", str(raw)) if p.strip()]


class ClientSerializer(serializers.ModelSerializer):
    # F001: 이세로 합산 메인 거래처명 — 화면 표시용 (쓰기는 parent_client id로)
    parent_client_name = serializers.CharField(
        source="parent_client.client_name", read_only=True, default=None)

    class Meta:
        model = Client
        fields = "__all__"

    def validate_parent_client(self, value):
        """자기 자신을 메인 거래처로 지정하거나, 메인 거래처가 또 다른 메인을
        가리키는 2단 연결은 막는다 (이세로 합산은 1단계만 본다)."""
        if value is None:
            return value
        if self.instance and value.pk == self.instance.pk:
            raise serializers.ValidationError("자기 자신을 메인 거래처로 지정할 수 없습니다.")
        if value.parent_client_id:
            raise serializers.ValidationError(
                f"'{value.client_name}'은(는) 이미 다른 극장에 합산되는 극장이라 메인으로 지정할 수 없습니다.")
        return value

    def validate_settlement_email(self, value):
        """부금 담당자 메일: 구분자로 나눠 각각 형식 검증 후 ', ' 로 정규화해 저장.

        추후 메일 자동발송 연동에서 그대로 split 해 쓸 수 있도록, 저장 형식을
        '주소1, 주소2, 주소3' 으로 통일한다.
        """
        emails = split_emails(value)
        if not emails:
            return ""
        if len(emails) > SETTLEMENT_EMAIL_MAX:
            raise serializers.ValidationError(
                f"부금 담당자 메일은 최대 {SETTLEMENT_EMAIL_MAX}개까지 입력할 수 있습니다.")
        invalid = [e for e in emails if not _EMAIL_RE.match(e)]
        if invalid:
            raise serializers.ValidationError(
                "메일 형식이 올바르지 않습니다: " + ", ".join(invalid))
        return ", ".join(emails)


class TheaterSerializer(serializers.ModelSerializer):

    class Meta:
        model = Theater
        fields = "__all__"


class FareSerializer(serializers.ModelSerializer):

    class Meta:
        model = Fare
        fields = "__all__"


class TheaterMapSerializer(serializers.ModelSerializer):
    # 읽기 전용으로 배급사와 극장의 상세 정보를 포함
    distributor_details = serializers.SerializerMethodField()
    theater_details = serializers.SerializerMethodField()

    class Meta:
        model = DistributorTheaterMap
        fields = [
            "id",
            "distributor",
            "theater",
            "distributor_theater_name",
            "apply_date",
            "distributor_details",
            "theater_details",
        ]

    def get_distributor_details(self, obj):
        return {"id": obj.distributor.id, "client_name": obj.distributor.client_name}

    def get_theater_details(self, obj):
        return {
            "id": obj.theater.id,
            "client_name": obj.theater.client_name,
            "client_code": obj.theater.client_code,
        }
