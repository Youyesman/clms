import csv
from django.core.management.base import BaseCommand
from django.db import transaction
from client.models import Client
from fund.models import Fund


class Command(BaseCommand):
    help = "Import fund data from a CSV file in bulk"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str, help="Path to the csv file")

    def handle(self, *args, **options):
        file_path = options["csv_file"]

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = list(csv.DictReader(f))  # 전체 데이터를 리스트로 변환

                # 1. CSV 내의 모든 ctm_code 수집
                ctm_codes = {row["ctm_code"].strip() for row in reader}

                # 2. 필요한 Client 객체들을 한 번에 조회해서 딕셔너리로 캐싱 {code: object}
                clients = {
                    c.client_code: c
                    for c in Client.objects.filter(client_code__in=ctm_codes)
                }

                funds_to_create = []
                error_count = 0

                for row in reader:
                    ctm_code = row["ctm_code"].strip()
                    try:
                        client_obj = clients.get(ctm_code)
                        if not client_obj:
                            self.stdout.write(
                                self.style.WARNING(f"Client 없음: {ctm_code}")
                            )
                            error_count += 1
                            continue

                        # Fund 객체 생성 (저장은 안 함)
                        funds_to_create.append(
                            Fund(
                                client=client_obj,
                                yyyy=int(row["yyyy"].strip()),
                                fund_yn=(
                                    True
                                    if row["fund_yn"].strip().upper() == "Y"
                                    else False
                                ),
                            )
                        )
                    except Exception as e:
                        error_count += 1
                        continue

                # 3. Bulk Create 실행
                with transaction.atomic():
                    # ignore_conflicts=True: 이미 존재하는 데이터(PK/Unique 충돌)는 건너뜀
                    # 만약 업데이트를 원하면 unique_fields와 update_fields를 지정 (Django 4.1+)
                    Fund.objects.bulk_create(
                        funds_to_create, batch_size=1000, ignore_conflicts=True
                    )

                self.stdout.write(
                    self.style.SUCCESS(
                        f"임포트 완료! 생성 시도: {len(funds_to_create)}, 실패/제외: {error_count}"
                    )
                )

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR("파일을 찾을 수 없습니다."))
