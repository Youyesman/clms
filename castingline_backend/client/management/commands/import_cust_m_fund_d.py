import csv
from django.core.management.base import BaseCommand
from django.db import transaction
from client.models import Client
from fund.models import MonthlyFund  # 위에서 만든 모델 임포트


class Command(BaseCommand):
    help = "Import monthly fund data from a CSV file in bulk"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str, help="Path to the csv file")

    def handle(self, *args, **options):
        file_path = options["csv_file"]

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = list(csv.DictReader(f))

                # 1. Client 캐싱
                ctm_codes = {row["ctm_code"].strip() for row in reader}
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
                            error_count += 1
                            continue

                        # MonthlyFund 객체 생성
                        funds_to_create.append(
                            MonthlyFund(
                                client=client_obj,
                                yyyy=int(row["yyyy"].strip()),
                                mm=int(row["MM"].strip()),  # MM 컬럼 추가
                                fund_yn=(
                                    True
                                    if row["fund_yn"].strip().upper() == "Y"
                                    else False
                                ),
                            )
                        )
                    except Exception:
                        error_count += 1
                        continue

                # 2. Bulk Create
                with transaction.atomic():
                    MonthlyFund.objects.bulk_create(
                        funds_to_create,
                        batch_size=2000,
                        ignore_conflicts=True,  # 중복 데이터는 저장 안 함
                    )

                self.stdout.write(
                    self.style.SUCCESS(
                        f"성공: {len(funds_to_create)}건, 실패/중복제외: {error_count}건"
                    )
                )

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR("파일을 찾을 수 없습니다."))
