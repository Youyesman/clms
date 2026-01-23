from datetime import datetime
import csv
from django.core.management.base import BaseCommand
from client.models import *

FARE_REMARK_MAPPING = {
    "001": "일반요금",
    "002": "TTL요금",
    "003": "심야요금",
    "004": "학생요금",
    "005": "할인요금",
    "006": "경로요금",
    "007": "일반할인요금",
    "008": "일반단체요금",
    "009": "학생단체요금",
    "010": "학생할인요금",
    "011": "제휴1",
    "012": "제휴2",
    "013": "기타",
    "014": "삼성카드요금",
    "015": "조조",
    "016": "na카드요금",
    "017": "BC카드 요금",
    "018": "LG카드요금",
    "019": "균일",
    "020": "일반헌혈할인",
    "021": "학생헌혈할인",
}


class Command(BaseCommand):
    help = 'Import Fare data from a CSV file'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str)

    def handle(self, *args, **options):
        file_path = options['csv_file']
        created_count = 0

        # Client 객체를 미리 캐싱
        clients = {client.client_code: client for client in Client.objects.all()}

        # Fare 객체를 저장할 리스트
        fares_to_create = []
        batch_size = 1000  # 한 번에 삽입할 배치 크기

        with open(options['csv_file'], newline='', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                fee_gb = row.get('fee_gb', '')  # fee_gb 값 가져오기, 기본값은 빈 문자열
                # fee_gb에 해당하는 fare_remark 매핑, 없으면 None
                fare_remark = FARE_REMARK_MAPPING.get(fee_gb, None)

                # 캐싱된 Client 객체에서 조회
                client = clients.get(row.get('ctm_code'))

                # Fare 객체 생성 (DB에 바로 저장하지 않음)
                fare = Fare(
                    fare=row.get('fee_code'),
                    fare_remark=fare_remark,
                    client=client
                )
                fares_to_create.append(fare)

                # 배치 크기에 도달하면 bulk_create 호출
                if len(fares_to_create) >= batch_size:
                    Fare.objects.bulk_create(fares_to_create)
                    created_count += len(fares_to_create)
                    fares_to_create = []  # 리스트 초기화

        # 남은 객체가 있으면 마지막으로 삽입
        if fares_to_create:
            Fare.objects.bulk_create(fares_to_create)
            created_count += len(fares_to_create)

        self.stdout.write(self.style.SUCCESS(
            f'{created_count} fares imported successfully!'))
