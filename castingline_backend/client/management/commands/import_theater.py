import csv
from django.core.management.base import BaseCommand
from django.db import transaction
from client.models import Client, Theater


class Command(BaseCommand):
    help = "Import Theater data from a CSV file in bulk"

    def add_arguments(self, parser):
        parser.add_argument("csv_file", type=str)

    def handle(self, *args, **options):
        file_path = options["csv_file"]

        # 1. 모든 Client 객체를 한 번에 조회하여 딕셔너리에 캐싱 (속도 향상의 핵심)
        # { 'client_code': client_instance } 형태
        client_map = {c.client_code: c for c in Client.objects.all()}

        theater_instances = []
        batch_size = 1000  # 한 번에 저장할 단위
        total_created = 0

        try:
            with open(file_path, newline="", encoding="utf-8") as csvfile:
                reader = csv.DictReader(csvfile)

                for row in reader:
                    ctm_code = row.get("ctm_code")
                    client_obj = client_map.get(ctm_code)

                    # 객체 생성 (DB에 저장하지 않고 리스트에만 담음)
                    theater_instances.append(
                        Theater(
                            auditorium=row.get("scr_code"),
                            auditorium_name=row.get("remark"),
                            seat_count=row.get("ser_qty") or 0,
                            client=client_obj,
                        )
                    )

                    # 2. 리스트가 batch_size에 도달하면 bulk_create 실행
                    if len(theater_instances) >= batch_size:
                        Theater.objects.bulk_create(theater_instances)
                        total_created += len(theater_instances)
                        theater_instances = []  # 리스트 비우기
                        self.stdout.write(f"Progress: {total_created} imported...")

                # 3. 남은 객체들 처리
                if theater_instances:
                    Theater.objects.bulk_create(theater_instances)
                    total_created += len(theater_instances)

            self.stdout.write(
                self.style.SUCCESS(f"Successfully imported {total_created} theaters!")
            )

        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f"File not found: {file_path}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"An error occurred: {str(e)}"))
