import csv
from django.core.management.base import BaseCommand
from client.models import Client

CSV_TO_MODEL_FIELD_MAP = {
    "ctm_code": "client_code",
    "ctm_gb": "client_type",  # 거래처 구분
    "ctm_desc_f": "client_name",  # 거래처 명
    "ctm_sort1": "client_status",  # 거래처 상태
    "dir_k": "classification",  # 분류
    "multi_name": "excel_theater_name",  # 엑셀 극장 명
    "ctm_area_s2": "region_code",  # 지역 코드
    "multi": "theater_kind",  # 극장 종류
    "sub_no": "business_operator",  # 사업자 번호
    "ctm_pc_gb": "legal_entity_type",  # 법인 구분
    "ctm_no": "business_registration_number",  # 사업자 등록 번호
    "ctm_desc": "business_name",  # 사업체 명
    "ctm_uptae": "business_category",  # 업태
    "ctm_upjong": "business_industry",  # 업종
    "ctm_addr1": "business_address",  # 사업장 주소
    "ctm_boss": "representative_name",  # 대표자명
    "ctm_tel": "settlement_phone_number",  # 정산 전화번호
    "ctm_fax": "fax_number",  # 팩스 번호
    "send_name": "settlement_contact",  # 정산 담당자
    "ctm_tel2": "representative_phone_number",  # 대표자 전화번호
    "ctm_email": "invoice_email_address",  # 세금계산서 이메일 주소
    "del_yn": "operational_status",  # 운영 여부
    "sp_name_yn": "distributor_theater_name",
    "login_id": "login_id",
    "pwd": "login_password",
    # 미정리 항목 (DB 컬럼 없음)
    # "settlement_department":
    # "settlement_mobile_number":
    # "invoice_email_address2":
    # "settlement_remarks":
}

CODE_VALUE_MAPPING = {
    "ctm_gb": {
        "006": "극장",
        "001": "제작사",
        "002": "배급사",
        "007": "매입처",
    },
    "dir_k": {
        "1": "직영",
        "2": "위탁",
        "9": "기타",
    },
    "ctm_area_s2": {
        "001": "서울",
        "002": "경강",
        "003": "경남",
        "004": "경북",
        "005": "충청",
        "006": "호남",
    },
    "multi": {
        "1": "롯데",
        "2": "CGV",
        "3": "메가박스",
        "5": "자동차극장",
        "6": "씨네큐",
        "8": "프리머스",
        "9": "일반극장",
        "99": "일반극장",
    },
    "ctm_pc_gb": {
        "1": "법인",
        "2": "개인",
    },
    "ctm_sort1": {
        "9999": "삭제(극장)",
        # 그 외 숫자는 사용(극장)
    },
    "sp_name_yn": {
        "Y": "배급사별 극장명",
        "N": "극장명 공통 사용",
        "X": "관리 제외(삭제)",
    },
}


class Command(BaseCommand):
    help = "Import Theater Clients from a CSV file with Korean headers"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str)

    def handle(self, *args, **options):
        with open(options["csv_file"], newline="", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            created = 0
            for row in reader:
                data = {}
                for csv_kor_field, model_field in CSV_TO_MODEL_FIELD_MAP.items():
                    value = row.get(csv_kor_field)

                    # Boolean 처리
                    if model_field == "operational_status":
                        value = value in ["True", "true", "1", "예", "Y"]

                    # ctm_sort1 특수 처리
                    elif csv_kor_field == "ctm_sort1":
                        if value == "9999":
                            value = "삭제(극장)"
                        elif value is None or value.strip() == "":
                            value = "제작사"
                        elif value.isdigit():
                            value = "사용(극장)"

                    # 그 외 코드 매핑 처리
                    elif csv_kor_field in CODE_VALUE_MAPPING:
                        value = CODE_VALUE_MAPPING[csv_kor_field].get(value, value)

                    data[model_field] = value

                Client.objects.create(**data)
                created += 1
            self.stdout.write(
                self.style.SUCCESS(f"{created} records imported successfully!")
            )
